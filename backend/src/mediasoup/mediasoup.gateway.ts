import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WsException,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UseGuards, Inject, forwardRef } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { Server, Socket } from 'socket.io';
import { MediasoupSessionService } from './mediasoup-session.service';
import { WsAuthGuard } from 'src/auth/guards/ws-auth.guard';
import { sanitizePayload } from 'src/common/helpers/sanitize.helper';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationService } from 'src/consultation/consultation.service';

@WebSocketGateway({ namespace: '/mediasoup', cors: true })
export class MediasoupGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MediasoupGateway.name);
  private clientTransports: Map<string, Set<string>> = new Map();
  private clientProducers: Map<string, Set<string>> = new Map();
  private clientConsumers: Map<string, Set<string>> = new Map();

  constructor(
    private readonly mediasoupService: MediasoupSessionService,
    @Inject(forwardRef(() => ConsultationService))
    private readonly consultationService: ConsultationService,
    private readonly databaseService: DatabaseService,
  ) {}

  afterInit() {
    this.logger.log('Mediasoup WebSocket Gateway initialized');
  }

  async isUserParticipant(
    consultationId: number,
    userId: number,
  ): Promise<boolean> {
    const participant = await this.databaseService.participant.findUnique({
      where: { consultationId_userId: { consultationId, userId } },
    });
    return !!participant;
  }

  async handleConnection(client: Socket) {
    this.logger.log(
      `Client connected: ${client.id} [${client.handshake.address}]`,
    );
    this.clientTransports.set(client.id, new Set());
    this.clientProducers.set(client.id, new Set());
    this.clientConsumers.set(client.id, new Set());
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(
      `Client disconnected: ${client.id} [${client.handshake.address}]`,
    );
    const transports = this.clientTransports.get(client.id) || [];
    for (const transportId of transports) {
      try {
        await this.mediasoupService.closeTransport(transportId);
      } catch (e) {
        this.logger.warn(
          `Failed to cleanup transport ${transportId}: ${e.message}`,
        );
      }
    }
    const producers = this.clientProducers.get(client.id) || [];
    for (const producerId of producers) {
      try {
        await this.mediasoupService.closeProducer(producerId);
      } catch (e) {
        this.logger.warn(
          `Failed to cleanup producer ${producerId}: ${e.message}`,
        );
      }
    }
    const consumers = this.clientConsumers.get(client.id) || [];
    for (const consumerId of consumers) {
      try {
        await this.mediasoupService.closeConsumer(consumerId);
      } catch (e) {
        this.logger.warn(
          `Failed to cleanup consumer ${consumerId}: ${e.message}`,
        );
      }
    }
    this.clientTransports.delete(client.id);
    this.clientProducers.delete(client.id);
    this.clientConsumers.delete(client.id);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('getRouterCapabilities')
  async handleGetCapabilities(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody() data: { consultationId?: number },
  ) {
    try {
      const { consultationId } = sanitizePayload(data, ['consultationId']);
      if (typeof consultationId !== 'number' || isNaN(consultationId)) {
        throw new WsException(
          'consultationId is required and must be a number',
        );
      }

      const isParticipant = await this.isUserParticipant(
        consultationId,
        client.data.user.id,
      );
      if (!isParticipant) {
        throw new WsException('Not authorized for this consultation');
      }

      this.logger.log(
        `getRouterCapabilities requested by client ${client.id} for consultation ${consultationId}`,
      );
      const router = this.mediasoupService.getRouter(consultationId);
      if (!router) {
        throw new WsException('No router found for this consultation');
      }
      return { rtpCapabilities: router.rtpCapabilities };
    } catch (error) {
      this.logger.error(
        `Error in getRouterCapabilities for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        event: 'getRouterCapabilities',
        message: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('createTransport')
  async handleCreateTransport(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: { consultationId?: number; type: 'producer' | 'consumer' },
  ) {
    try {
      const { consultationId, type } = sanitizePayload(data, [
        'consultationId',
        'type',
      ]);
      if (typeof consultationId !== 'number' || isNaN(consultationId)) {
        throw new WsException(
          'consultationId is required and must be a number',
        );
      }

      const isParticipant = await this.isUserParticipant(
        consultationId,
        client.data.user.id,
      );
      if (!isParticipant) {
        throw new WsException('Not authorized for this consultation');
      }

      if (type !== 'producer' && type !== 'consumer') {
        throw new WsException(
          "type is required and must be either 'producer' or 'consumer'",
        );
      }
      this.logger.log(
        `createTransport requested by client ${client.id} for consultation ${consultationId}, type: ${type}`,
      );
      const transportInfo = await this.mediasoupService.createTransport(
        consultationId,
        type,
      );
      this.clientTransports.get(client.id)?.add(transportInfo.id);
      return transportInfo;
    } catch (error) {
      this.logger.error(
        `Error in createTransport for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        event: 'createTransport',
        message: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('connectTransport')
  async handleConnectTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string; dtlsParameters: any },
  ) {
    try {
      const { transportId, dtlsParameters } = sanitizePayload(data, [
        'transportId',
        'dtlsParameters',
      ]);
      if (!transportId) {
        throw new WsException('transportId is required');
      }
      await this.mediasoupService.connectTransport(transportId, dtlsParameters);
      return { connected: true };
    } catch (error) {
      this.logger.error(
        `Error in connectTransport for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        event: 'connectTransport',
        message: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('produce')
  async handleProduce(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: {
      consultationId?: number;
      transportId: string;
      kind: string;
      rtpParameters: any;
      appData?: any;
    },
  ) {
    try {
      const { consultationId, transportId, kind, rtpParameters, appData } =
        sanitizePayload(data, [
          'consultationId',
          'transportId',
          'kind',
          'rtpParameters',
          'appData',
        ]);

      if (typeof consultationId !== 'number' || isNaN(consultationId)) {
        throw new WsException(
          'consultationId is required and must be a number',
        );
      }
      const isParticipant = await this.isUserParticipant(
        consultationId,
        client.data.user.id,
      );
      if (!isParticipant) {
        throw new WsException('Not authorized for this consultation');
      }

      if (!transportId || !kind || !rtpParameters) {
        throw new WsException(
          'transportId, kind and rtpParameters are required',
        );
      }
      function asMediaKind(value: string): mediasoup.types.MediaKind {
        if (value === 'audio' || value === 'video') return value;
        throw new Error(`Invalid media kind: ${value}`);
      }
      const validKind = asMediaKind(kind);
      const producerInfo = await this.mediasoupService.produce(
        transportId,
        validKind,
        rtpParameters,
        appData,
      );
      this.clientProducers.get(client.id)?.add(producerInfo.id);
      return producerInfo;
    } catch (error) {
      this.logger.error(
        `Error in produce for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', { event: 'produce', message: error.message });
      throw new WsException(error.message);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('consume')
  async handleConsume(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: {
      consultationId?: number;
      transportId: string;
      producerId: string;
      rtpCapabilities: any;
    },
  ) {
    try {
      const { consultationId, transportId, producerId, rtpCapabilities } =
        sanitizePayload(data, [
          'consultationId',
          'transportId',
          'producerId',
          'rtpCapabilities',
        ]);

      if (typeof consultationId !== 'number' || isNaN(consultationId)) {
        throw new WsException(
          'consultationId is required and must be a number',
        );
      }
      const isParticipant = await this.isUserParticipant(
        consultationId,
        client.data.user.id,
      );
      if (!isParticipant) {
        throw new WsException('Not authorized for this consultation');
      }

      if (!transportId || !producerId || !rtpCapabilities) {
        throw new WsException(
          'transportId, producerId and rtpCapabilities are required',
        );
      }
      const consumerInfo = await this.mediasoupService.consume(
        transportId,
        producerId,
        rtpCapabilities,
      );
      this.clientConsumers.get(client.id)?.add(consumerInfo.id);
      return consumerInfo;
    } catch (error) {
      this.logger.error(
        `Error in consume for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', { event: 'consume', message: error.message });
      throw new WsException(error.message);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('closeTransport')
  async handleCloseTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string },
  ) {
    try {
      const { transportId } = sanitizePayload(data, ['transportId']);
      if (!transportId) {
        throw new WsException('transportId is required');
      }
      await this.mediasoupService.closeTransport(transportId);
      this.clientTransports.get(client.id)?.delete(transportId);
      return { closed: true };
    } catch (error) {
      this.logger.error(
        `Error in closeTransport for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', { event: 'closeTransport', message: error.message });
      throw new WsException(error.message);
    }
  }
}
