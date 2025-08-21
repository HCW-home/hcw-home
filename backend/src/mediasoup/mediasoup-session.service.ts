import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { DatabaseService } from 'src/database/database.service';
import { createClient, RedisClientType } from 'redis';
import { ConfigService } from 'src/config/config.service';
import { v4 as uuidv4 } from 'uuid';

type RouterEntry = {
  router: mediasoup.types.Router;
  workerPid: number;
  correlationId: string;
};

@Injectable()
export class MediasoupSessionService implements OnModuleDestroy, OnModuleInit {
  ensureRouterForConsultation(consultationId: any) {
    throw new Error('Method not implemented.');
  }
  private readonly logger = new Logger(MediasoupSessionService.name);

  private workers: mediasoup.types.Worker[] = [];
  private routers: Map<number, RouterEntry> = new Map();
  private transports: Map<string, mediasoup.types.Transport> = new Map();
  private producers: Map<string, mediasoup.types.Producer> = new Map();
  private consumers: Map<string, mediasoup.types.Consumer> = new Map();
  private workerRouterCount: Map<number, number> = new Map();
  private connectionStats: Map<string, any> = new Map();

  private redisPublisher: RedisClientType;
  private redisSubscriber: RedisClientType;

  private readonly serverId: string;
  private readonly serverLoad: Map<string, number> = new Map();

  private readonly sessionTimeoutMs = 5 * 60 * 1000;
  scalingThresholdLow: number;
  scalingThresholdHigh: number;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.serverId = this.configService.serverId;
  }

  async onModuleInit(): Promise<void> {
    await this.initializeWorkers();
    await this.initRedis();

    setInterval(() => this.cleanupInactiveSessions(), 60 * 1000);

    setInterval(() => this.monitorAndScaleWorkers(), 30 * 1000);
  }

  private logStructured(
    level: 'log' | 'error' | 'warn' | 'verbose',
    message: string,
    meta: Record<string, any> = {},
  ) {
    if (level === 'verbose' && process.env.NODE_ENV !== 'production') return;
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'mediasoup-session',
      ...meta,
      message,
    };
    switch (level) {
      case 'error':
        this.logger.error(JSON.stringify(logEntry));
        break;
      case 'warn':
        this.logger.warn(JSON.stringify(logEntry));
        break;
      case 'verbose':
        this.logger.verbose(JSON.stringify(logEntry));
        break;
      default:
        this.logger.log(JSON.stringify(logEntry));
    }
  }

  private async initRedis() {
    const redisUrl = this.configService.redisUrl;
    this.redisPublisher = createClient({ url: redisUrl });
    this.redisSubscriber = createClient({ url: redisUrl });

    this.redisPublisher.on('error', (err) =>
      this.logger.error('Redis Publisher error', err),
    );
    this.redisSubscriber.on('error', (err) =>
      this.logger.error('Redis Subscriber error', err),
    );

    await this.redisPublisher.connect();
    await this.redisSubscriber.connect();

    await this.redisSubscriber.subscribe('mediasoup:load:update', (message) => {
      try {
        const parsed = JSON.parse(message);
        this.serverLoad.set(parsed.serverId, parsed.load);
        this.logStructured('verbose', 'Received load update', {
          serverId: parsed.serverId,
          load: parsed.load,
        });
      } catch (err) {
        this.logger.error('Failed to parse Redis load update message', err);
      }
    });

    setInterval(() => this.broadcastLoad(), 5000);
  }

  private async broadcastLoad() {
    const totalRouters = Array.from(this.workerRouterCount.values()).reduce(
      (a, b) => a + b,
      0,
    );
    const msg = JSON.stringify({ serverId: this.serverId, load: totalRouters });
    try {
      await this.redisPublisher.publish('mediasoup:load:update', msg);
      this.logStructured('verbose', 'Broadcasted load', {
        serverId: this.serverId,
        load: totalRouters,
      });
    } catch (err) {
      this.logStructured('error', 'Failed to publish load', {
        error: err.message,
      });
    }
  }

  async getLeastLoadedServer(): Promise<string> {
    if (this.serverLoad.size === 0) return this.serverId;

    let minLoad = Number.MAX_SAFE_INTEGER;
    let bestServer = this.serverId;
    for (const [serverId, load] of this.serverLoad.entries()) {
      if (load < minLoad) {
        minLoad = load;
        bestServer = serverId;
      }
    }
    this.logStructured('verbose', 'Selected least loaded server', {
      selectedServer: bestServer,
      load: minLoad,
    });
    return bestServer;
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
        this.logStructured('error', `Worker died, will restart`, {
          pid: worker.pid,
        });
        this.removeWorker(worker.pid);
        this.addWorker().catch((e) => {
          this.logStructured(
            'error',
            `Failed to restart worker: ${e.message}`,
            {},
          );
        });
      });

      this.workers.push(worker);
      this.workerRouterCount.set(worker.pid, 0);
      this.logStructured('log', 'Worker added', { pid: worker.pid });
    } catch (error) {
      this.logStructured('error', 'Failed to add mediasoup worker', {
        error: error.message,
      });
    }
  }

  private async _removeWorkerAndCleanup(pid: number) {
    const workerIndex = this.workers.findIndex((w) => w.pid === pid);
    if (workerIndex === -1) return;

    for (const [consultationId, routerEntry] of this.routers.entries()) {
      if (routerEntry.workerPid === pid) {
        await this.cleanupRouterForConsultation(consultationId);
      }
    }

    try {
      await this.workers[workerIndex].close();
      this.logStructured('log', 'Worker closed', { pid });
    } catch (err) {
      this.logStructured('error', 'Error closing worker', {
        pid,
        error: err.message,
      });
    }

    this.workers.splice(workerIndex, 1);
    this.workerRouterCount.delete(pid);
    this.logStructured('log', 'Worker removed', { pid });
  }

  async removeIdleWorkers(minActiveRouters = 1) {
    for (const worker of this.workers) {
      const activeRouters = this.workerRouterCount.get(worker.pid) ?? 0;
      if (activeRouters <= minActiveRouters) {
        this.logStructured('log', 'Removing idle worker', {
          pid: worker.pid,
          activeRouters,
        });
        await this._removeWorkerAndCleanup(worker.pid);
        break;
      }
    }
  }

  async scaleWorkers(targetCount: number) {
    const currentCount = this.workers.length;
    if (targetCount > currentCount) {
      while (this.workers.length < targetCount) {
        await this.addWorker();
      }
    } else if (targetCount < currentCount) {
      while (this.workers.length > targetCount) {
        await this.removeIdleWorkers();
      }
    }
  }

  private removeWorker(pid: number) {
    const index = this.workers.findIndex((w) => w.pid === pid);
    if (index !== -1) {
      this.workers.splice(index, 1);
      this.workerRouterCount.delete(pid);
      this.logStructured('log', 'Worker removed (removeWorker)', { pid });
    }
  }

  private getLeastLoadedWorker(): mediasoup.types.Worker | null {
    if (this.workers.length === 0) {
      this.logStructured('error', 'No mediasoup workers available');
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
    this.logStructured('verbose', 'Selected least loaded worker', {
      pid: leastLoadedWorker.pid,
      routerCount: minLoad,
    });
    return leastLoadedWorker;
  }

  async createRouterForConsultation(consultationId: number) {
    const correlationId = uuidv4();
    this.logStructured('log', 'Creating router', {
      consultationId,
      correlationId,
    });

    const worker = this.getLeastLoadedWorker();
    if (!worker) throw new Error('No available mediasoup worker found');

    const preferredServerId = await this.getLeastLoadedServer();

    const server = await this.databaseService.mediasoupServer.findUnique({
      where: { id: preferredServerId },
    });

    if (!server || !server.active)
      throw new Error('No available mediasoup server found');

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

    router.observer.on('close', () => {
      this.logStructured('log', 'Router closed', {
        consultationId,
        correlationId,
      });
    });

    await this.databaseService.mediasoupRouter.create({
      data: {
        consultationId,
        routerId: router.id,
        serverId: server.id,
      },
    });

    this.routers.set(consultationId, {
      router,
      workerPid: worker.pid,
      correlationId,
    });
    this.workerRouterCount.set(
      worker.pid,
      (this.workerRouterCount.get(worker.pid) ?? 0) + 1,
    );
    this.logStructured('log', 'Router created for consultation', {
      consultationId,
      workerPid: worker.pid,
      routerId: router.id,
      correlationId,
    });

    return router;
  }

  async cleanupRouterForConsultation(consultationId: number) {
    const entry = this.routers.get(consultationId);
    if (!entry) {
      this.logStructured(
        'warn',
        'No router found for consultation to cleanup',
        {
          consultationId,
        },
      );
      return;
    }

    const { router, workerPid, correlationId } = entry;

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
      this.logStructured('log', 'Router cleaned up for consultation', {
        consultationId,
      });
    } catch (error) {
      this.logStructured('error', 'Failed to cleanup router', {
        consultationId,
        error: error.message,
      });
    }
  }

  getRouter(consultationId: number): mediasoup.types.Router | undefined {
    return this.routers.get(consultationId)?.router;
  }

  private pollTransportStats(
    consultationId: number,
    transport: mediasoup.types.Transport,
  ) {
    const pollInterval = this.configService.transportStatsPollInterval || 5000;

    const interval = setInterval(async () => {
      try {
        const stats = await transport.getStats();
        const key = `${consultationId}-transport-${transport.id}`;
        this.connectionStats.set(key, { stats, lastUpdated: Date.now() });
        this.logger.verbose(`Collected transport stats for ${key}`);
      } catch (error) {
        this.logger.warn(
          `Failed to collect stats for transport ${transport.id}: ${error.message}`,
        );
      }
    }, pollInterval);

    (transport as any)._statsInterval = interval;

    transport.on('@close', () => {
      clearInterval(interval);
      this.connectionStats.delete(
        `${consultationId}-transport-${transport.id}`,
      );
      this.logger.verbose(
        `Transport ${transport.id} closed, stopped stats polling`,
      );
    });
  }

  private pollProducerStats(
    consultationId: number,
    producer: mediasoup.types.Producer,
  ) {
    const pollInterval = this.configService.producerStatsPollInterval || 5000;

    const interval = setInterval(async () => {
      try {
        const stats = await producer.getStats();
        const key = `${consultationId}-producer-${producer.id}`;
        this.connectionStats.set(key, { stats, lastUpdated: Date.now() });
        this.logger.verbose(`Collected producer stats for ${key}`);
      } catch (error) {
        this.logger.warn(
          `Failed to collect stats for producer ${producer.id}: ${error.message}`,
        );
      }
    }, pollInterval);

    (producer as any)._statsInterval = interval;

    producer.on('@close', () => {
      clearInterval(interval);
      this.connectionStats.delete(`${consultationId}-producer-${producer.id}`);
      this.logger.verbose(
        `Producer ${producer.id} closed, stopped stats polling`,
      );
    });
  }

  async createTransport(
    consultationId: number,
    type: 'producer' | 'consumer',
  ): Promise<any> {
    const routerEntry = this.routers.get(consultationId);
    if (!routerEntry) throw new Error('Router not found for consultation');

    const { router, correlationId } = routerEntry;
    const announcedIp = this.configService.mediasoupAnnouncedIp;

    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    this.transports.set(transport.id, transport);
    this.pollTransportStats(consultationId, transport);

    try {
      await this.databaseService.mediasoupTransport.create({
        data: {
          id: transport.id,
          consultationId,
          type,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      this.logStructured('warn', 'Failed to persist transport', {
        transportId: transport.id,
        error: error.message,
        consultationId,
        correlationId,
      });
    }

    transport.on('@close', () =>
      this.logStructured('log', 'Transport closed by mediasoup', {
        transportId: transport.id,
        consultationId,
        correlationId,
      }),
    );

    this.logStructured('log', 'Transport created', {
      transportId: transport.id,
      consultationId,
      correlationId,
    });

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
    this.logStructured('log', 'Transport connected', { transportId });
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
    this.pollProducerStats(appData?.consultationId, producer);

    try {
      await this.databaseService.mediasoupProducer.create({
        data: {
          id: producer.id,
          transportId,
          consultationId: appData?.consultationId ?? null,
          kind,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      this.logStructured('warn', 'Failed to persist producer', {
        producerId: producer.id,
        error: error.message,
      });
    }

    producer.on('@close', () =>
      this.logStructured('log', 'Producer closed by mediasoup', {
        producerId: producer.id,
      }),
    );

    this.logStructured('log', 'Producer created', {
      producerId: producer.id,
      transportId,
    });

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
      this.logStructured('log', 'Consumer closed by mediasoup', {
        consumerId: consumer.id,
      }),
    );

    this.logStructured('log', 'Consumer created', {
      consumerId: consumer.id,
      transportId,
    });

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
      clearInterval((transport as any)._statsInterval);
      this.connectionStats.delete(`transport-${transportId}`);
      await transport.close();
      this.transports.delete(transportId);
      this.logStructured('log', 'Transport closed', { transportId });

      try {
        await this.databaseService.mediasoupTransport.delete({
          where: { id: transportId },
        });
      } catch (error) {
        this.logStructured('warn', 'Failed to remove transport from DB', {
          transportId,
          error: error.message,
        });
      }
    }
  }

  async closeProducer(producerId: string) {
    const producer = this.producers.get(producerId);
    if (producer) {
      clearInterval((producer as any)._statsInterval);
      this.connectionStats.delete(`producer-${producerId}`);
      await producer.close();
      this.producers.delete(producerId);
      this.logStructured('log', 'Producer closed', { producerId });

      try {
        await this.databaseService.mediasoupProducer.delete({
          where: { id: producerId },
        });
      } catch (error) {
        this.logStructured('warn', 'Failed to remove producer from DB', {
          producerId,
          error: error.message,
        });
      }
    }
  }

  async closeConsumer(consumerId: string) {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      await consumer.close();
      this.consumers.delete(consumerId);
      this.logStructured('log', 'Consumer closed', { consumerId });
    }
  }

  async cleanupInactiveSessions() {
    const now = Date.now();

    for (const [consultationId] of this.routers.entries()) {
      const participants = await this.databaseService.participant.findMany({
        where: { consultationId, isActive: true },
        select: { lastActiveAt: true },
      });

      if (participants.length === 0) {
        this.logStructured(
          'log',
          'Cleaning up session with no active participants',
          { consultationId },
        );
        await this.cleanupRouterForConsultation(consultationId);
        await this.databaseService.consultation.update({
          where: { id: consultationId },
          data: { status: 'TERMINATED_OPEN' },
        });
        continue;
      }

      const allInactive = participants.every(
        (p) =>
          p.lastActiveAt &&
          now - new Date(p.lastActiveAt).getTime() > this.sessionTimeoutMs,
      );

      if (allInactive) {
        this.logStructured(
          'log',
          'Cleaning up inactive session due to timeout',
          { consultationId },
        );
        await this.cleanupRouterForConsultation(consultationId);
        await this.databaseService.consultation.update({
          where: { id: consultationId },
          data: { status: 'TERMINATED_OPEN' },
        });
      }
    }
  }

  async monitorAndScaleWorkers() {
    if (this.workers.length === 0) {
      this.logStructured(
        'warn',
        'No mediasoup workers available during scaling check',
      );
      return;
    }

    const totalRouters = Array.from(this.workerRouterCount.values()).reduce(
      (a, b) => a + b,
      0,
    );
    const avgLoad = totalRouters / this.workers.length;

    if (avgLoad > this.scalingThresholdHigh) {
      this.logStructured('log', 'Scaling workers up due to high load', {
        avgLoad,
        currentWorkers: this.workers.length,
      });
      await this.scaleWorkers(this.workers.length + 1);
    } else if (avgLoad < this.scalingThresholdLow && this.workers.length > 1) {
      this.logStructured('log', 'Scaling workers down due to low load', {
        avgLoad,
        currentWorkers: this.workers.length,
      });
      await this.removeIdleWorkers();
    }
  }

  async onModuleDestroy() {
    this.logStructured(
      'log',
      'Cleaning up mediasoup resources on module destroy',
    );

    for (const consumer of this.consumers.values()) {
      try {
        await consumer.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing consumer during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.consumers.clear();

    for (const producer of this.producers.values()) {
      try {
        await producer.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing producer during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.producers.clear();

    for (const transport of this.transports.values()) {
      try {
        await transport.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing transport during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.transports.clear();

    for (const entry of this.routers.values()) {
      try {
        await entry.router.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing router during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.routers.clear();

    for (const worker of this.workers) {
      try {
        await worker.close();
        this.logStructured('log', 'Worker closed during module destroy', {
          pid: worker.pid,
        });
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing worker during module destroy',
          {
            pid: worker.pid,
            error: error.message,
          },
        );
      }
    }
    this.workers = [];
    this.workerRouterCount.clear();

    try {
      await this.redisPublisher?.quit();
      await this.redisSubscriber?.quit();
      this.logStructured('log', 'Redis clients closed successfully.');
    } catch (err) {
      this.logger.error(
        'Error closing Redis clients during module destroy',
        err,
      );
    }
  }

  async getHealthMetrics() {
    return {
      workerCount: this.workers.length,
      activeRouters: this.routers.size,
      activeTransports: this.transports.size,
      activeProducers: this.producers.size,
      activeConsumers: this.consumers.size,
      serverLoad: Array.from(this.workerRouterCount.entries()).map(
        ([pid, count]) => ({
          pid,
          routerCount: count,
        }),
      ),
    };
  }

  async acquireRouterAssignmentLock(consultationId: number): Promise<boolean> {
    const lockKey = `mediasoup:router_lock:${consultationId}`;
    const lockAcquired = await this.redisPublisher.set(lockKey, this.serverId, {
      NX: true,
      PX: 30000,
    });
    return lockAcquired === 'OK';
  }

  async releaseRouterAssignmentLock(consultationId: number): Promise<void> {
    const lockKey = `mediasoup:router_lock:${consultationId}`;
    await this.redisPublisher.del(lockKey);
  }

  getConnectionStats(consultationId: number) {
    const result: Record<string, any> = {};
    for (const [key, value] of this.connectionStats.entries()) {
      if (key.startsWith(`${consultationId}-`)) {
        result[key] = value;
      }
    }
    return result;
  }
}
