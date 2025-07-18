import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { DatabaseService } from 'src/database/database.service';

type RouterEntry = {
  router: mediasoup.types.Router;
  workerPid: number;
};

@Injectable()
export class MediasoupSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(MediasoupSessionService.name);
  private workers: mediasoup.types.Worker[] = [];
  private routers: Map<number, RouterEntry> = new Map();
  private transports: Map<string, mediasoup.types.Transport> = new Map();
  private producers: Map<string, mediasoup.types.Producer> = new Map();
  private consumers: Map<string, mediasoup.types.Consumer> = new Map();
  private workerRouterCount: Map<number, number> = new Map();

  constructor(private readonly databaseService: DatabaseService) {
    this.initializeWorkers();
  }

  private async initializeWorkers() {
    const numWorkers = 3; 
    for (let i = 0; i < numWorkers; i++) {
      await this.addWorker();
    }
  }

  private async addWorker() {
    try {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 40000,
        rtcMaxPort: 49999,
      });
      worker.on('died', () => {
        this.logger.error(`Mediasoup worker ${worker.pid} died, restarting...`);
        this.removeWorker(worker.pid);
        this.addWorker();
      });
      this.workers.push(worker);
      this.workerRouterCount.set(worker.pid, 0);
      this.logger.log(`Mediasoup worker ${worker.pid} added`);
    } catch (error) {
      this.logger.error('Failed to add mediasoup worker', error);
    }
  }

  private removeWorker(pid: number) {
    const index = this.workers.findIndex((w) => w.pid === pid);
    if (index !== -1) {
      this.workers.splice(index, 1);
      this.workerRouterCount.delete(pid);
      this.logger.log(`Mediasoup worker ${pid} removed`);
    }
  }

  private getLeastLoadedWorker(): mediasoup.types.Worker | null {
    if (this.workers.length === 0) {
      this.logger.error('No mediasoup workers available');
      return null;
    }
    let leastLoadedWorker = this.workers[0];
    let minLoad = this.workerRouterCount.get(leastLoadedWorker.pid) ?? 0;
    for (const worker of this.workers) {
      const load = this.workerRouterCount.get(worker.pid) ?? 0;
      if (load < minLoad) {
        leastLoadedWorker = worker;
        minLoad = load;
      }
    }
    this.logger.verbose(
      `Selected least loaded worker ${leastLoadedWorker.pid} with ${minLoad} routers`,
    );
    return leastLoadedWorker;
  }

  async createRouterForConsultation(consultationId: number) {
    const worker = this.getLeastLoadedWorker();
    if (!worker) throw new Error('No available mediasoup worker found');

    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: { 'x-google-start-bitrate': 1000 },
        },
      ],
    });

    const server = await this.getAvailableServer();
    if (!server) throw new Error('No available mediasoup server found');

    await this.databaseService.mediasoupRouter.create({
      data: {
        consultationId,
        routerId: router.id,
        serverId: server.id,
      },
    });

    this.routers.set(consultationId, { router, workerPid: worker.pid });
    this.workerRouterCount.set(
      worker.pid,
      (this.workerRouterCount.get(worker.pid) ?? 0) + 1,
    );
    this.logger.log(
      `Router created for consultation ${consultationId} on worker ${worker.pid}`,
    );

    return router;
  }

  async cleanupRouterForConsultation(consultationId: number) {
    const entry = this.routers.get(consultationId);
    if (!entry) {
      this.logger.warn(
        `No router found for consultation ${consultationId} to cleanup`,
      );
      return;
    }
    const { router, workerPid } = entry;
    try {
      await router.close();
      this.routers.delete(consultationId);
      this.workerRouterCount.set(
        workerPid,
        Math.max(0, (this.workerRouterCount.get(workerPid) ?? 1) - 1),
      );
      await this.databaseService.mediasoupRouter.delete({
        where: { consultationId },
      });
      this.logger.log(`Router cleaned up for consultation ${consultationId}`);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup router for consultation ${consultationId}`,
        error,
      );
    }
  }

  private async getAvailableServer() {
    return this.databaseService.mediasoupServer.findFirst({
      where: { active: true },
    });
  }

  getRouter(consultationId: number): mediasoup.types.Router | undefined {
    return this.routers.get(consultationId)?.router;
  }

  async createTransport(consultationId: number, type: 'producer' | 'consumer') {
    const router = this.getRouter(consultationId);
    if (!router) throw new Error('Router not found');

    const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP;
    if (!announcedIp) {
      throw new Error(
        'MEDIASOUP_ANNOUNCED_IP environment variable not configured',
      );
    }

    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    this.transports.set(transport.id, transport);

    transport.on('@close', () =>
      this.logger.log(`Transport ${transport.id} closed by mediasoup`),
    );

    this.logger.log(
      `Transport created with id ${transport.id} for consultation ${consultationId}`,
    );

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters,
  ) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    await transport.connect({ dtlsParameters });
    this.logger.log(`Transport ${transportId} connected`);
  }

  async produce(
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: mediasoup.types.RtpParameters,
    appData?: any,
  ) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = await transport.produce({ kind, rtpParameters, appData });
    this.producers.set(producer.id, producer);

    producer.on('@close', () =>
      this.logger.log(`Producer ${producer.id} closed by mediasoup`),
    );

    this.logger.log(
      `Producer created with id ${producer.id} on transport ${transportId}`,
    );
    return { id: producer.id };
  }

  async consume(
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities,
  ) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });
    this.consumers.set(consumer.id, consumer);

    consumer.on('@close', () =>
      this.logger.log(`Consumer ${consumer.id} closed by mediasoup`),
    );

    this.logger.log(
      `Consumer created with id ${consumer.id} on transport ${transportId}`,
    );
    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
    };
  }

  async closeTransport(transportId: string) {
    const transport = this.transports.get(transportId);
    if (transport) {
      await transport.close();
      this.transports.delete(transportId);
      this.logger.log(`Transport ${transportId} closed`);
    }
  }

  async closeProducer(producerId: string) {
    const producer = this.producers.get(producerId);
    if (producer) {
      await producer.close();
      this.producers.delete(producerId);
      this.logger.log(`Producer ${producerId} closed`);
    }
  }

  async closeConsumer(consumerId: string) {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      await consumer.close();
      this.consumers.delete(consumerId);
      this.logger.log(`Consumer ${consumerId} closed`);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Cleaning up mediasoup resources on module destroy');

    for (const consumer of this.consumers.values()) {
      try {
        await consumer.close();
      } catch (error) {
        this.logger.error(
          'Error closing consumer during module destroy',
          error,
        );
      }
    }
    this.consumers.clear();

    for (const producer of this.producers.values()) {
      try {
        await producer.close();
      } catch (error) {
        this.logger.error(
          'Error closing producer during module destroy',
          error,
        );
      }
    }
    this.producers.clear();

    for (const transport of this.transports.values()) {
      try {
        await transport.close();
      } catch (error) {
        this.logger.error(
          'Error closing transport during module destroy',
          error,
        );
      }
    }
    this.transports.clear();

    for (const entry of this.routers.values()) {
      try {
        await entry.router.close();
      } catch (error) {
        this.logger.error('Error closing router during module destroy', error);
      }
    }
    this.routers.clear();

    for (const worker of this.workers) {
      try {
        await worker.close();
        this.logger.log(`Worker ${worker.pid} closed`);
      } catch (error) {
        this.logger.error(`Error closing worker ${worker.pid}`, error);
      }
    }
    this.workers = [];
    this.workerRouterCount.clear();
  }
}
