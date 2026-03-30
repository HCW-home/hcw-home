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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Logger, UseGuards } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { Server, Socket } from 'socket.io';
import { MediasoupSessionService } from './mediasoup-session.service';
import { WsAuthGuard } from 'src/auth/guards/ws-auth.guard';
import { sanitizePayload } from 'src/common/helpers/sanitize.helper';
import { DatabaseService } from 'src/database/database.service';
import { InviteService } from 'src/auth/invite/invite.service';
import { UserRole } from '@prisma/client';

import { MediaEventService } from './media-event.service';
import { ChatService } from '../chat/chat.service';
import { MediaEventType } from '@prisma/client';

@WebSocketGateway({
  namespace: '/mediasoup',
  cors: {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
    transports: ['websocket', 'polling'],
  },
})
export class MediasoupGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MediasoupGateway.name);
  private clientTransports: Map<string, Set<string>> = new Map();
  private clientProducers: Map<string, Set<string>> = new Map();
  private clientConsumers: Map<string, Set<string>> = new Map();
  private connectionStats: Map<string, any> = new Map();

  constructor(
    private readonly mediasoupService: MediasoupSessionService,
    private readonly invitationService: InviteService,
    private readonly databaseService: DatabaseService,
    private readonly mediaEventService: MediaEventService,
    private readonly chatService: ChatService,
  ) { }

  afterInit(): void {
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

  @UseGuards(WsAuthGuard)
  async handleConnection(client: Socket & { data: any }) {
    this.logger.log(
      `Client connected: ${client.id} [${client.handshake.address}]`,
    );
    this.clientTransports.set(client.id, new Set());
    this.clientProducers.set(client.id, new Set());
    this.clientConsumers.set(client.id, new Set());

    const { consultationId, userId } = client.handshake.query;
    if (consultationId && userId) {
      client.data = { consultationId: +consultationId, userId: +userId };
      await this.mediaEventService.createMediaEvent(
        +consultationId,
        +userId,
        MediaEventType.USER_JOINED,
      );
      await this.chatService.createSystemMessage(
        +consultationId,
        `User ${userId} joined the consultation.`,
      );
    }
  }

  @UseGuards(WsAuthGuard)
  async handleDisconnect(client: Socket & { data: any }) {
    this.logger.log(
      `Client disconnected: ${client.id} [${client.handshake.address}]`,
    );

    const { consultationId, userId } = client.data;
    if (consultationId && userId) {
      await this.mediaEventService.createMediaEvent(
        consultationId,
        userId,
        MediaEventType.USER_LEFT,
      );
      await this.chatService.createSystemMessage(
        consultationId,
        `User ${userId} left the consultation.`,
      );
    }

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

  @SubscribeMessage('mediaAction')
  async handleMediaAction(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: {
      consultationId: number;
      userId: number;
      type: MediaEventType;
    },
  ) {
    const { consultationId, userId, type } = data;
    await this.mediaEventService.createMediaEvent(consultationId, userId, type);

    let message = '';
    switch (type) {
      case MediaEventType.CAM_ON:
        message = `User ${userId} turned on their camera.`;
        break;
      case MediaEventType.CAM_OFF:
        message = `User ${userId} turned off their camera.`;
        break;
      case MediaEventType.MIC_ON:
        message = `User ${userId} turned on their microphone.`;
        break;
      case MediaEventType.MIC_OFF:
        message = `User ${userId} turned off their microphone.`;
        break;
    }

    if (message) {
      await this.chatService.createSystemMessage(consultationId, message);
    }
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

  @UseGuards(WsAuthGuard, ThrottlerGuard)
  @SubscribeMessage('createTransport')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  @UseGuards(WsAuthGuard, ThrottlerGuard)
  @SubscribeMessage('produce')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  @UseGuards(WsAuthGuard, ThrottlerGuard)
  @SubscribeMessage('consume')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('media_permission_status')
  async handleMediaPermissionStatus(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: {
      consultationId: number;
      userId: number;
      camera: 'enabled' | 'disabled' | 'blocked';
      microphone: 'enabled' | 'disabled' | 'blocked';
    },
  ) {
    try {
      const { consultationId, userId, camera, microphone } = data;

      const isParticipant = await this.isUserParticipant(
        consultationId,
        userId,
      );
      if (!isParticipant) {
        throw new WsException('User not a participant of this consultation');
      }

      this.server
        .to(`consultation:${consultationId}`)
        .emit('media_permission_status_update', {
          userId,
          camera,
          microphone,
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      this.logger.error(
        `Error handling media_permission_status for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        event: 'media_permission_status',
        message: error.message,
      });
      throw new WsException(error.message);
    }
  }
  @UseGuards(WsAuthGuard)
  @SubscribeMessage('collect_stats')
  async handleCollectStats(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: {
      consultationId: number;
      stats: {
        type: 'producer' | 'consumer' | 'transport';
        id: string;
        stats: any; // RTC stats JSON blob sent
      };
    },
  ) {
    try {
      const { consultationId } = data;
      const { type, id, stats: statPayload } = data.stats;

      const authorized = await this.isUserParticipant(
        consultationId,
        client.data.user.id,
      );
      if (!authorized) {
        throw new WsException('Not authorized for this consultation');
      }

      const key = `${consultationId}-${type}-${id}`;
      this.connectionStats.set(key, {
        ...statPayload,
        lastUpdated: Date.now(),
      });

      // Immediately emit received raw stats to all participants in consultation room
      this.server
        .to(`consultation:${consultationId}`)
        .emit('connection_quality_update', {
          type,
          id,
          stats: statPayload,
          userId: client.data.user.id,
          timestamp: new Date().toISOString(),
        });

      return { success: true };
    } catch (error) {
      this.logger.error(`Collect stats error: ${error.message}`, error.stack);
      client.emit('error', { event: 'collect_stats', message: error.message });
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('media_permission_denied')
  async handleMediaPermissionDenied(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: {
      consultationId: number;
      userId: number;
      camera: 'denied' | 'blocked';
      microphone: 'denied' | 'blocked';
    },
  ) {
    try {
      const { consultationId, userId, camera, microphone } = data;

      const isParticipant = await this.isUserParticipant(
        consultationId,
        userId,
      );
      if (!isParticipant) {
        throw new WsException('User not a participant of this consultation');
      }

      this.logger.warn(
        `User ${userId} denied media permissions: camera=${camera}, microphone=${microphone}`,
      );

      this.server
        .to(`consultation:${consultationId}`)
        .emit('media_permission_denied_notification', {
          userId,
          camera,
          microphone,
          timestamp: new Date().toISOString(),
          message: `User ${userId} denied permission for ${camera === 'denied' || camera === 'blocked' ? 'camera ' : ''
            }${microphone === 'denied' || microphone === 'blocked'
              ? 'microphone'
              : ''
            }.`,
        });
    } catch (error) {
      this.logger.error(
        `Error handling media_permission_denied for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        event: 'media_permission_denied',
        message: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('client_error')
  async handleClientError(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: { consultationId: number; userId: number; errorMessage: string },
  ) {
    try {
      const { consultationId, userId, errorMessage } = data;
      const isParticipant = await this.isUserParticipant(
        consultationId,
        userId,
      );
      if (!isParticipant) {
        throw new WsException('User not a participant of this consultation');
      }

      this.logger.warn(
        `Client error reported by user ${userId} in consultation ${consultationId}: ${errorMessage}`,
      );

      this.server
        .to(`consultation:${consultationId}`)
        .emit('client_error_notification', {
          userId,
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      this.logger.error(
        `Error handling client_error for client ${client.id}: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        event: 'client_error',
        message: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('client_reconnect')
  async handleClientReconnect(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody() data: { consultationId: number; userId: number },
  ) {
    try {
      const { consultationId, userId } = data;
      const isParticipant = await this.isUserParticipant(
        consultationId,
        userId,
      );
      if (!isParticipant) {
        throw new WsException('User not a participant of this consultation');
      }

      this.logger.log(
        `Client reconnecting: user ${userId}, consultation ${consultationId}`,
      );

      // Optionally refresh mediasoup transport/producer/consumer states if your service supports it
      // e.g. await this.mediasoupService.refreshSessionForUser(consultationId, userId);

      this.server.to(`consultation:${consultationId}`).emit('system_message', {
        type: 'user_reconnected',
        userId,
        timestamp: new Date().toISOString(),
        message: `User ${userId} reconnected to media session.`,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Handling client_reconnect failed: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        event: 'client_reconnect',
        message: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('invite_participant_email')
  async handleInviteParticipantEmail(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: { consultationId: number; inviteEmail: string; role: UserRole },
  ) {
    try {
      const { consultationId, inviteEmail, role } = sanitizePayload(data, [
        'consultationId',
        'inviteEmail',
        'role',
      ]);
      if (!consultationId || !inviteEmail || !role) {
        throw new WsException(
          'consultationId, inviteEmail and role are required',
        );
      }

      // Verify user permission - practitioner/admin of consultation
      const userRole = client.data.role;
      const userId = client.data.user.id;
      if (userRole !== UserRole.PRACTITIONER && userRole !== UserRole.ADMIN) {
        throw new WsException('Not authorized to invite participants');
      }

      // Create invitation record and send email
      const invitation = await this.invitationService.createInvitationEmail(
        consultationId,
        userId,
        inviteEmail,
        role,
      );

      // Emit back the invite explicitly to inviter client
      client.emit('participant_invited', {
        consultationId,
        inviteEmail,
        role,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
      });

      this.logger.log(
        `Participant invited: email=${inviteEmail} role=${role} consultation=${consultationId} by user=${userId}`,
      );
    } catch (error) {
      this.logger.error('invite_participant_email failed:', error);
      throw new WsException(error.message);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('join_via_invite')
  async handleJoinViaInvite(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody() data: { token: string; userId?: number },
  ) {
    try {
      const { token, userId } = data;
      if (!token) {
        throw new WsException('Invitation token is required');
      }

      const invitation = await this.invitationService.validateToken(token);
      const consultationId = invitation.consultationId;

      if (userId) {
        await this.invitationService.markUsed(token, userId);
      }

      if (typeof userId !== 'number') {
        throw new WsException('userId is required to join as a participant');
      }
      let participant = await this.databaseService.participant.findUnique({
        where: {
          consultationId_userId: { consultationId, userId },
        },
      });

      if (!participant) {
        if (typeof userId !== 'number') {
          throw new WsException('userId is required to join as a participant');
        }
        participant = await this.databaseService.participant.create({
          data: {
            consultationId,
            userId,
            role: invitation.role,
            isActive: false,
            joinedAt: null,
          },
        });
      }

      await this.mediasoupService.ensureRouterForConsultation(consultationId);

      this.server
        .to(`consultation:${consultationId}`)
        .emit('participant_invite_joined', {
          userId,
          consultationId,
          role: invitation.role,
          joinedAt: participant.joinedAt,
        });

      return { success: true, consultationId, role: invitation.role };
    } catch (error) {
      this.logger.error('join_via_invite error:', error);
      throw new WsException(error.message);
    }
  }
}
