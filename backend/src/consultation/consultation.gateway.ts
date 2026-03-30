import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { WsAuthGuard } from 'src/auth/guards/ws-auth.guard';
import { ConsultationService } from './consultation.service';
import { ConsultationUtilityService } from './consultation-utility.service';
import { ConsultationMediaSoupService } from './consultation-mediasoup.service';
import { DatabaseService } from 'src/database/database.service';
import { MediasoupSessionService } from 'src/mediasoup/mediasoup-session.service';
import { ConsultationStatus, UserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { EndConsultationDto } from './dto/end-consultation.dto';
import { RateConsultationDto } from './dto/rate-consultation.dto';
import { ActivateConsultationDto } from './dto/activate-consultation.dto';
import { InviteService } from '../auth/invite/invite.service';
import { IConsultationGateway } from './interfaces/consultation-gateway.interface';
import { ConfigService } from '../config/config.service';
import { ChatService } from '../chat/chat.service';
import { MessageType } from '../chat/dto/create-message.dto';
import { EnhancedRealtimeService } from './enhanced-realtime.service';
import { WaitingRoomService } from './waiting-room.service';
import {
  UpdateMediaDeviceStatusDto,
  UpdateConnectionQualityDto,
  SendEnhancedMessageDto,
  UpdateTypingIndicatorDto,
} from './dto/realtime-input.dto';

function sanitizePayload<T extends object, K extends keyof T>(
  payload: T,
  allowedFields: K[],
): Pick<T, K> {
  const sanitized = {} as Pick<T, K>;
  for (const key of allowedFields) {
    if (key in payload) {
      sanitized[key] = payload[key];
    }
  }
  return sanitized;
}

@UseGuards(WsAuthGuard)
@WebSocketGateway({
  namespace: '/consultation',
  cors: {
    origin: '*', // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
    transports: ['websocket', 'polling'],
  },
})
export class ConsultationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, IConsultationGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ConsultationGateway.name);
  private clientRooms = new Map<string, number>();
  private clientTransports = new Map<string, Set<string>>();
  private clientProducers = new Map<string, Set<string>>();
  private clientConsumers = new Map<string, Set<string>>();

  // Enhanced features
  private connectedClients = new Map<string, Socket & { userId?: number; consultationId?: number; userRole?: UserRole }>();
  private consultationRooms = new Map<number, Set<string>>();
  private userConnectionQuality = new Map<string, any>();
  private connectionRetryAttempts = new Map<string, number>();
  private clientLastSeen = new Map<string, Date>();
  private clientHeartbeat = new Map<string, NodeJS.Timeout>();

  private joinNotificationDebounce = new Map<string, number>();
  // Short debounce for patient_joined focused emits to avoid duplicate rapid notifications
  private patientJoinedDebounce = new Map<string, number>();

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => ConsultationService))
    private readonly consultationService: ConsultationService,
    private readonly consultationUtilityService: ConsultationUtilityService,
    private readonly consultationMediaSoupService: ConsultationMediaSoupService,
    private readonly mediasoupSessionService: MediasoupSessionService,
    private readonly invitationService: InviteService,
    private readonly configService: ConfigService,
    private readonly enhancedRealtimeService: EnhancedRealtimeService,
    private readonly chatService: ChatService,
    private readonly waitingRoomService: WaitingRoomService,
  ) { }

  afterInit(server: Server) {
    this.logger.log('🚀 ConsultationGateway initialized');
    this.logger.log(`✅ WebSocket server is ready: ${!!server}`);
  }

  async handleConnection(client: Socket) {
    try {
      const q = client.handshake.query;
      const consultationId = Number(q.consultationId);
      const userId = Number(q.userId);
      const role = q.role as UserRole;

      const allowedRoles = [
        UserRole.PATIENT,
        UserRole.PRACTITIONER,
        UserRole.EXPERT,
        UserRole.GUEST,
      ] as const;
      if (!consultationId || !userId || !allowedRoles.includes(role as any)) {
        client.emit('error', { message: 'Invalid connection parameters.' });
        client.disconnect(true);
        return;
      }

      if (
        ([UserRole.PRACTITIONER, UserRole.EXPERT] as UserRole[]).includes(role)
      ) {
        const connectedSameRole =
          await this.databaseService.participant.findMany({
            where: {
              consultationId,
              isActive: true,
              role,
            },
          });
        if (
          connectedSameRole.length > 0 &&
          !connectedSameRole.some((p) => p.userId === userId)
        ) {
          client.emit('error', {
            message: `Another ${role.toLowerCase()} is already connected to this consultation.`,
          });
          client.disconnect(true);
          return;
        }
      }

      await client.join(`consultation:${consultationId}`);

      if (role === UserRole.PRACTITIONER || role === UserRole.EXPERT) {
        await client.join(`${role.toLowerCase()}:${userId}`);
      }

      // Also join a generic user room so server-side emit helpers can target users
      // regardless of role-specific room naming used elsewhere in the codebase.
      await client.join(`user-${userId}`);

      client.data = { consultationId, userId, role };
      this.clientRooms.set(client.id, consultationId);
      this.clientTransports.set(client.id, new Set());
      this.clientProducers.set(client.id, new Set());
      this.clientConsumers.set(client.id, new Set());

      // Enhanced features - store client with extended properties
      const enhancedClient = client as Socket & { userId?: number; consultationId?: number; userRole?: UserRole };
      enhancedClient.userId = userId;
      enhancedClient.consultationId = consultationId;
      enhancedClient.userRole = role;
      this.connectedClients.set(client.id, enhancedClient);
      this.updateClientLastSeen(client.id);
      this.startClientHeartbeat(client.id, client);
      this.resetConnectionRetryAttempts(client.id);

      // Add to consultation room tracking
      if (!this.consultationRooms.has(consultationId)) {
        this.consultationRooms.set(consultationId, new Set());
      }
      this.consultationRooms.get(consultationId)?.add(client.id);

      await this.databaseService.participant.upsert({
        where: { consultationId_userId: { consultationId, userId } },
        create: {
          consultationId,
          userId,
          role,
          isActive: true,
          joinedAt: new Date(),
          lastActiveAt: new Date(),
        },
        update: {
          isActive: true,
          joinedAt: new Date(),
          lastActiveAt: new Date(),
        },
      });

      this.logger.log(
        `Client connected: ${client.id}, Consultation: ${consultationId}, User: ${userId}, Role: ${role}`,
      );
      // Audit log for connection will be after nowISO is declared

      const nowISO = new Date().toISOString();
      // Audit log for connection
      this.logger.verbose(`[AUDIT] User ${userId} (${role}) joined consultation ${consultationId} at ${nowISO}`);

      const roleLabels = {
        [UserRole.PATIENT]: 'Patient',
        [UserRole.PRACTITIONER]: 'Practitioner',
        [UserRole.EXPERT]: 'Expert',
        [UserRole.GUEST]: 'Guest',
      };
      this.server.to(`consultation:${consultationId}`).emit('system_message', {
        type: 'user_joined',
        userId,
        role,
        timestamp: nowISO,
        message: `${roleLabels[role]} joined the consultation`,
      });
      // Emit a reconnection-friendly event for clients to re-sync state
      this.server.to(client.id).emit('session_sync', {
        consultationId,
        userId,
        role,
        timestamp: nowISO,
        message: 'Session synchronized after connection/reconnection',
      });

      if (role === UserRole.PATIENT) {
        const consultation = await this.databaseService.consultation.findUnique(
          {
            where: { id: consultationId },
            select: { status: true },
          },
        );
        if (consultation?.status === ConsultationStatus.WAITING) {
          this.server
            .to(`consultation:${consultationId}`)
            .emit('system_message', {
              type: 'waiting_for_participant',
              userId,
              role,
              timestamp: nowISO,
              message: `Patient is waiting for practitioner to join`,
            });
        }
      }

      if (role === UserRole.PRACTITIONER || role === UserRole.EXPERT) {
        const patientParticipants =
          await this.databaseService.participant.findMany({
            where: { consultationId, role: UserRole.PATIENT, isActive: true },
          });

        if (patientParticipants.length > 0) {
          this.server
            .to(`consultation:${consultationId}`)
            .emit('doctor_joined', {
              consultationId,
              practitionerId: userId,
              message: `${roleLabels[role]} has joined. You may now join the consultation.`,
            });
        }
      }

      if (role === UserRole.PATIENT) {
        const consultation = await this.databaseService.consultation.findUnique(
          {
            where: { id: consultationId },
            include: { owner: true, rating: true },
          },
        );

        // Emit a canonical waiting room notification to the practitioner (if assigned)
        try {
          const patientUser = await this.databaseService.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true, country: true },
          });

          const practitionerId = consultation?.owner?.id ?? consultation?.ownerId;
          if (practitionerId) {
            const initials = `${(patientUser?.firstName?.[0] ?? '')}${(patientUser?.lastName?.[0] ?? '')}`.toUpperCase();
            this.server
              .to(`practitioner:${practitionerId}`)
              .emit('waiting_room_notification', {
                consultationId,
                patientId: userId,
                patientFirstName: patientUser?.firstName ?? 'Patient',
                patientInitials: initials,
                joinTime: new Date().toISOString(),
                language: patientUser?.country ?? null,
                message: 'Patient is waiting in the consultation room',
              });
            // Also emit a focused patient_joined event targeted at the practitioner (centralized helper)
            const requestId = (client.handshake.headers && (client.handshake.headers['x-request-id'] as string)) || uuidv4();
            this.emitPatientJoinedToPractitioner(practitionerId, {
              consultationId,
              patientId: userId,
              patientFirstName: patientUser?.firstName ?? 'Patient',
              joinTime: new Date().toISOString(),
              message: 'Patient joined and is waiting',
              origin: 'socket',
              requestId,
            });
          }
        } catch (e) {
          this.logger.warn(`Failed to emit waiting_room_notification: ${e?.message ?? e}`);
        }

        if (consultation) {
          const canJoin = consultation.status === ConsultationStatus.ACTIVE;
          const waitingForDoctor =
            consultation.status === ConsultationStatus.WAITING ||
            consultation.status === ConsultationStatus.DRAFT;

          const practitionerId = consultation.owner?.id ?? consultation.ownerId;

          if (practitionerId) {
            const debounceKey = `patient_join_notify:${consultationId}:${practitionerId}`;
            const now = Date.now();
            const lastNotified =
              this.joinNotificationDebounce.get(debounceKey) ?? 0;
            const debounceDurationMs = 60 * 1000;

            if (now - lastNotified > debounceDurationMs) {
              this.server
                .to(`practitioner:${practitionerId}`)
                .emit('patient_waiting', {
                  consultationId,
                  patientId: userId,
                  message: 'Patient is waiting in the consultation room.',
                });
              this.joinNotificationDebounce.set(debounceKey, now);
            }
          }

          client.emit('consultation_status_patient', {
            status: consultation.status,
            canJoin,
            waitingForDoctor,
            scheduledDate: consultation.scheduledDate,
            doctorName: consultation.owner
              ? `${consultation.owner.firstName} ${consultation.owner.lastName}`
              : '',
            rating: consultation.rating
              ? {
                value: consultation.rating.rating,
                color: consultation.rating.rating >= 4 ? 'green' : 'red',
                done: true,
              }
              : { value: 0, color: null, done: false },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`, error.stack);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const { consultationId, userId, role } = client.data ?? {};
      if (!consultationId || !userId || !role) return;

      await this.databaseService.participant.updateMany({
        where: { consultationId, userId },
        data: { isActive: false, lastActiveAt: new Date() },
      });

      for (const transportId of this.clientTransports.get(client.id) ?? []) {
        try {
          await this.mediasoupSessionService.closeTransport(transportId);
        } catch (e) {
          this.logger.warn(
            `Failed to close transport ${transportId}: ${e.message}`,
          );
        }
      }
      for (const producerId of this.clientProducers.get(client.id) ?? []) {
        try {
          await this.mediasoupSessionService.closeProducer(producerId);
        } catch (e) {
          this.logger.warn(
            `Failed to close producer ${producerId}: ${e.message}`,
          );
        }
      }
      for (const consumerId of this.clientConsumers.get(client.id) ?? []) {
        try {
          await this.mediasoupSessionService.closeConsumer(consumerId);
        } catch (e) {
          this.logger.warn(
            `Failed to close consumer ${consumerId}: ${e.message}`,
          );
        }
      }

      this.clientTransports.delete(client.id);
      this.clientProducers.delete(client.id);
      this.clientConsumers.delete(client.id);

      // Enhanced features cleanup
      this.connectedClients.delete(client.id);
      this.consultationRooms.get(consultationId)?.delete(client.id);
      this.userConnectionQuality.delete(client.id);

      // Create real-time event for user leaving (if enhanced service is available)
      try {
        await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
          eventType: 'user_left',
          message: `User left the consultation`,
          eventData: { userRole: role, leftAt: new Date() }
        });
      } catch (error) {
        this.logger.warn(`Failed to create enhanced real-time event: ${error.message}`);
      }

      const consultation = await this.databaseService.consultation.findUnique({
        where: { id: consultationId },
      });
      if (!consultation) return;

      const roleLabels = {
        [UserRole.PATIENT]: 'Patient',
        [UserRole.PRACTITIONER]: 'Practitioner',
        [UserRole.EXPERT]: 'Expert',
        [UserRole.GUEST]: 'Guest',
      };

      const nowISO = new Date().toISOString();
      this.server.to(`consultation:${consultationId}`).emit('system_message', {
        type: 'user_left',
        userId,
        role,
        timestamp: nowISO,
        message: `${roleLabels[role]} left the consultation`,
      });
      // Audit log for disconnect
      this.logger.verbose(`[AUDIT] User ${userId} (${role}) left consultation ${consultationId} at ${nowISO}`);
      // Always emit disconnect event for session recovery
      this.server.to(client.id).emit('session_ended', {
        consultationId,
        userId,
        role,
        timestamp: nowISO,
        message: 'Session ended due to disconnect',
      });

      if (role === UserRole.PRACTITIONER || role === UserRole.EXPERT) {
        await this.databaseService.consultation.update({
          where: { id: consultationId },
          data: { status: ConsultationStatus.TERMINATED_OPEN },
        });

        try {
          await this.mediasoupSessionService.cleanupRouterForConsultation(
            consultationId,
          );
        } catch (e) {
          this.logger.warn(
            `Mediasoup cleanup failed for consultation ${consultationId}: ${e.message}`,
          );
        }

        this.server
          .to(`consultation:${consultationId}`)
          .emit('media_session_closed', {
            consultationId,
            mediasoupCleaned: true,
          });
        this.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_terminated', {
            consultationId,
            reason: `${roleLabels[role]} disconnected`,
          });
      }

      if (role === UserRole.PATIENT) {
        const activePatients = await this.databaseService.participant.findMany({
          where: { consultationId, role: UserRole.PATIENT, isActive: true },
        });

        if (
          activePatients.length === 0 &&
          consultation.status === ConsultationStatus.WAITING
        ) {
          await this.databaseService.consultation.update({
            where: { id: consultationId },
            data: { status: ConsultationStatus.SCHEDULED },
          });

          this.server
            .to(`consultation:${consultationId}`)
            .emit('consultation_status', {
              status: ConsultationStatus.SCHEDULED,
              triggeredBy: 'All patients left',
            });
        }
      }
    } catch (error) {
      this.logger.error(`Disconnect error: ${error.message}`, error.stack);
    }
  }

  @SubscribeMessage('admit_patient')
  async handleAdmitPatient(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; patientId?: number },
  ) {
    try {
      const { consultationId, patientId } = data;
      const { role, userId } = client.data;
      if (role !== UserRole.PRACTITIONER && role !== UserRole.ADMIN) {
        throw new Error('Only practitioners or admins can admit patients');
      }

      const admissionResult = await this.consultationService.admitPatient(
        { consultationId },
        userId,
      );

      if (admissionResult.success) {
        let mediasoupRouter =
          this.mediasoupSessionService.getRouter(consultationId);
        if (!mediasoupRouter) {
          mediasoupRouter =
            await this.mediasoupSessionService.createRouterForConsultation(
              consultationId,
            );
          this.logger.log(
            `Mediasoup router created for consultation ${consultationId} on admit_patient`,
          );
        }

        // Get patient information for transition event
        const consultation = await this.databaseService.consultation.findUnique({
          where: { id: consultationId },
          include: {
            participants: {
              where: { role: UserRole.PATIENT },
              include: { user: true },
            },
          },
        });

        const patientParticipant = consultation?.participants.find(
          p => !patientId || p.userId === patientId
        );

        // Emit consultation status change
        this.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_status', {
            status: ConsultationStatus.ACTIVE,
            initiatedBy: role,
            timestamp: new Date().toISOString(),
          });

        // Emit patient admission event with production-grade navigation details
        if (patientParticipant) {
          // Generate proper URLs using config service
          const consultationUrls = this.configService.generateConsultationUrls(
            consultationId,
            UserRole.PATIENT,
          );

          const transitionEvent = {
            consultationId,
            patient: {
              id: patientParticipant.userId,
              firstName: patientParticipant.user.firstName,
              lastName: patientParticipant.user.lastName,
            },
            transition: {
              from: 'waiting-room',
              to: 'consultation-room',
              timestamp: new Date().toISOString(),
              admittedBy: userId,
              admittedByRole: role,
            },
            navigation: {
              redirectTo: 'consultation-room',
              sessionUrl: consultationUrls.patient.consultationRoom,
              frontendRoute: consultationUrls.patient.consultationRoom,
              autoRedirect: true,
              timeout: this.configService.sessionTimeoutMs,
            },
            urls: consultationUrls,
            consultation: {
              status: ConsultationStatus.ACTIVE,
              mediasoupReady: !!mediasoupRouter,
            },
          };

          // Notify all participants about patient admission
          this.server
            .to(`consultation:${consultationId}`)
            .emit('patient_admitted', transitionEvent);

          // Send direct navigation command to patient
          this.server
            .to(`patient:${patientParticipant.userId}`)
            .emit('navigate_to_consultation_room', {
              url: transitionEvent.navigation.frontendRoute,
              sessionUrl: transitionEvent.navigation.sessionUrl,
              autoRedirect: true,
              message: 'You have been admitted to the consultation. Redirecting...',
              timeout: transitionEvent.navigation.timeout,
            });

          // Notify practitioner of successful admission
          this.server
            .to(`practitioner:${userId}`)
            .emit('patient_admission_confirmed', {
              ...transitionEvent,
              practitioner: {
                message: 'Patient has been successfully admitted to consultation',
                dashboardUrl: transitionEvent.urls.practitioner.dashboard,
                consultationRoomUrl: transitionEvent.urls.practitioner.consultationRoom,
              },
            });
        }

        // Emit media session ready event
        this.server
          .to(`consultation:${consultationId}`)
          .emit('media_session_live', {
            consultationId,
            timestamp: new Date().toISOString(),
            mediasoupReady: true,
          });
      }

      return admissionResult;
    } catch (error) {
      this.logger.error('Admit patient failed', error.stack);
      client.emit('error', {
        message: 'Failed to admit patient',
        details: error.message,
      });
    }
  }

  @SubscribeMessage('join_practitioner_room')
  async handleJoinPractitionerRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { practitionerId: number },
  ) {
    try {
      if (!data || !data.practitionerId) return;
      await client.join(`practitioner:${data.practitionerId}`);
      this.logger.log(`Client ${client.id} joined practitioner:${data.practitionerId} room via join_practitioner_room`);
    } catch (error) {
      this.logger.warn(`join_practitioner_room failed: ${error?.message ?? error}`);
    }
  }

  @SubscribeMessage('check_session_status')
  async handleCheckSessionStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; patientId: number },
  ) {
    try {
      const { consultationId, patientId } = data;

      // Get current consultation and participant status
      const consultation = await this.databaseService.consultation.findUnique({
        where: { id: consultationId },
        include: {
          participants: {
            where: { userId: patientId },
            include: { user: true },
          },
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (!consultation) {
        client.emit('session_status_response', {
          success: false,
          error: 'Consultation not found',
        });
        return;
      }

      const participant = consultation.participants[0];
      if (!participant) {
        client.emit('session_status_response', {
          success: false,
          error: 'Patient not found in consultation',
        });
        return;
      }

      // Determine current session state and appropriate navigation with proper URLs
      const consultationUrls = this.configService.generateConsultationUrls(
        consultationId,
        UserRole.PATIENT,
      );

      const sessionStatus = {
        consultationId,
        patientId,
        consultation: {
          status: consultation.status,
          isActive: consultation.status === ConsultationStatus.ACTIVE,
          practitionerOnline: await this.isPractitionerOnline(consultationId),
        },
        participant: {
          isActive: participant.isActive,
          inWaitingRoom: participant.inWaitingRoom,
          joinedAt: participant.joinedAt,
          lastActiveAt: participant.lastActiveAt,
        },
        navigation: {
          currentLocation: participant.inWaitingRoom ? 'waiting-room' : 'consultation-room',
          recommendedAction: this.getRecommendedAction(consultation.status, participant),
          sessionUrl: participant.inWaitingRoom
            ? consultationUrls.patient.waitingRoom
            : consultationUrls.patient.consultationRoom,
          frontendRoute: participant.inWaitingRoom
            ? consultationUrls.patient.waitingRoom
            : consultationUrls.patient.consultationRoom,
          timeout: this.configService.sessionTimeoutMs,
        },
        urls: consultationUrls,
        config: {
          sessionTimeout: this.configService.sessionTimeoutMs,
          consultationTimeout: this.configService.consultationTimeoutMs,
          canRejoin: true,
        },
        timestamp: new Date().toISOString(),
      };

      client.emit('session_status_response', {
        success: true,
        data: sessionStatus,
      });

    } catch (error) {
      this.logger.error(`Session status check failed: ${error.message}`, error.stack);
      client.emit('session_status_response', {
        success: false,
        error: 'Failed to check session status',
      });
    }
  }

  // Helper methods
  private async isPractitionerOnline(consultationId: number): Promise<boolean> {
    try {
      const onlinePractitioner = await this.databaseService.participant.findFirst({
        where: {
          consultationId,
          role: UserRole.PRACTITIONER,
          isActive: true,
        },
      });
      return !!onlinePractitioner;
    } catch {
      return false;
    }
  }

  private getRecommendedAction(
    consultationStatus: ConsultationStatus,
    participant: any,
  ): string {
    if (consultationStatus === ConsultationStatus.COMPLETED) {
      return 'consultation_ended';
    }

    if (participant.inWaitingRoom) {
      return consultationStatus === ConsultationStatus.ACTIVE
        ? 'wait_for_admission'
        : 'wait_for_practitioner';
    }

    return consultationStatus === ConsultationStatus.ACTIVE
      ? 'join_consultation'
      : 'wait_in_consultation_room';
  }

  /**
   * Centralized helper to emit a focused patient_joined event to a practitioner.
   * Applies a short debounce to avoid duplicate rapid notifications and logs every emit.
   */
  emitPatientJoinedToPractitioner(practitionerId: number, payload: any): void {
    try {
      if (!practitionerId) return;
      const key = `patient_joined:${payload.consultationId}:${practitionerId}`;
      const now = Date.now();
      const last = this.patientJoinedDebounce.get(key) ?? 0;
      const debounceMs = this.configService?.patientJoinedDebounceMs ?? 10000;
      if (now - last < debounceMs) {
        this.logger.log({
          message: 'Skipped patient_joined emit due to debounce',
          consultationId: payload.consultationId,
          practitionerId,
          patientId: payload.patientId,
          elapsedMs: now - last,
        } as any);
        return;
      }

      this.patientJoinedDebounce.set(key, now);

      // Structured log for telemetry
      this.logger.log({
        message: 'Emitting patient_joined to practitioner',
        consultationId: payload.consultationId,
        practitionerId,
        patientId: payload.patientId,
        origin: payload.origin ?? 'unknown',
        requestId: payload.requestId ?? null,
        timestamp: new Date().toISOString(),
      } as any);

      // Attach server-side emittedAt for traceability
      const emitPayload = { ...payload, emittedAt: new Date().toISOString() };

      this.server.to(`practitioner:${practitionerId}`).emit('patient_joined', emitPayload);
    } catch (error) {
      this.logger.warn(`emitPatientJoinedToPractitioner failed: ${error?.message ?? error}`);
    }
  }

  @UseGuards()
  @SubscribeMessage('invite_participant')
  async handleInviteParticipant(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody()
    data: {
      consultationId: number;
      inviteEmail: string;
      role: UserRole;
      name?: string;
      notes?: string;
    },
  ) {
    try {
      const { consultationId, inviteEmail, role, name, notes } =
        sanitizePayload(data, [
          'consultationId',
          'inviteEmail',
          'role',
          'name',
          'notes',
        ]);

      if (!consultationId || !inviteEmail || !role) {
        throw new WsException(
          'consultationId, inviteEmail, and role are required',
        );
      }

      const normalisedEmail = inviteEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)) {
        throw new WsException('Invalid email address format');
      }

      const allowedRoles: UserRole[] = [
        UserRole.PATIENT,
        UserRole.EXPERT,
        UserRole.GUEST,
      ];
      if (!allowedRoles.includes(role)) {
        throw new WsException(`Invalid invitation role: ${role}`);
      }

      const userRole = client.data.role;
      const userId = client.data.userId;
      if (userRole !== UserRole.PRACTITIONER && userRole !== UserRole.ADMIN) {
        throw new WsException('Not authorized to invite participants');
      }
      if (userRole === UserRole.PRACTITIONER) {
        const consultation = await this.databaseService.consultation.findUnique(
          {
            where: { id: consultationId },
            select: { ownerId: true },
          },
        );
        if (!consultation || consultation.ownerId !== userId) {
          throw new WsException('You are not the owner of this consultation');
        }
      }

      const invitation = await this.invitationService.createInvitationEmail(
        consultationId,
        userId,
        normalisedEmail,
        role,
        name,
        notes,
      );

      client.emit('participant_invited', {
        consultationId,
        inviteEmail: normalisedEmail,
        role,
        name,
        notes,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
      });

      this.logger.log(
        `Participant invited: email=${normalisedEmail} role=${role} consultation=${consultationId} by user=${userId}`,
      );

      this.server
        .to(`consultation:${consultationId}`)
        .emit('participant_invitation_sent', {
          consultationId,
          inviteEmail: normalisedEmail,
          role,
          name,
          notes,
        });

      this.server
        .to(`consultation:${consultationId}`)
        .emit('participant_added', {
          consultationId,
          participant: invitation,
        });
    } catch (error) {
      this.logger.error('invite_participant failed:', error);
      throw new WsException(error.message);
    }
  }

  @UseGuards()
  @SubscribeMessage('join_via_invite')
  async handleJoinViaInvite(
    @ConnectedSocket() client: Socket & { data: any },
    @MessageBody() data: { token: string; userId: number },
  ) {
    try {
      const { token, userId } = data;
      if (!token) {
        throw new WsException('Invitation token is required');
      }
      if (typeof userId !== 'number') {
        throw new WsException('userId is required to join as a participant');
      }

      const invitation = await this.invitationService.validateToken(token);
      const consultationId = invitation.consultationId;

      await this.invitationService.markUsed(token, userId);

      const now = new Date();
      let participant = await this.databaseService.participant.findUnique({
        where: {
          consultationId_userId: { consultationId, userId },
        },
      });

      if (!participant) {
        participant = await this.databaseService.participant.create({
          data: {
            consultationId,
            userId,
            role: invitation.role,
            isActive: true,
            joinedAt: now,
            inWaitingRoom: false,
            lastActiveAt: now,
          },
        });
      } else {
        await this.databaseService.participant.update({
          where: {
            consultationId_userId: { consultationId, userId },
          },
          data: {
            isActive: true,
            joinedAt: now,
            inWaitingRoom: false,
            lastActiveAt: now,
          },
        });
      }

      await this.mediasoupSessionService.ensureRouterForConsultation(
        consultationId,
      );

      this.server
        .to(`consultation:${consultationId}`)
        .emit('participant_invite_joined', {
          userId,
          consultationId,
          role: invitation.role,
          joinedAt: participant.joinedAt,
        });

      if (invitation.role === UserRole.PATIENT) {
        const consultation = await this.databaseService.consultation.findUnique(
          {
            where: { id: consultationId },
            select: { ownerId: true },
          },
        );
        if (consultation?.ownerId) {
          this.server
            .to(`practitioner:${consultation.ownerId}`)
            .emit('patient_waiting', {
              consultationId,
              patientId: userId,
              message: 'Patient joined via invitation and is waiting.',
              joinTime: now,
            });
        }
      }

      return { success: true, consultationId, role: invitation.role };
    } catch (error) {
      this.logger.error('join_via_invite error:', error);
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('end_consultation')
  async handleEndConsultation(
    @ConnectedSocket() client: Socket,
    @MessageBody() endDto: EndConsultationDto,
  ) {
    try {
      const { consultationId, action } = endDto;
      const { role, userId } = client.data;

      if (role !== UserRole.PRACTITIONER && role !== UserRole.ADMIN) {
        throw new Error('Only practitioners or admins can end consultations');
      }

      const result = await this.consultationService.endConsultation(
        endDto,
        userId,
      );

      if (result.success && result.data) {
        this.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_ended', {
            status: result.data.status,
            action,
            terminatedBy: userId,
            deletionScheduledAt: result.data.deletionScheduledAt ?? undefined,
            retentionHours: result.data.retentionHours ?? undefined,
          });

        this.server
          .to(`consultation:${consultationId}`)
          .emit('media_session_closed', {
            consultationId,
            mediasoupCleaned: true,
          });

        if (result.data.status === ConsultationStatus.COMPLETED) {
          this.server
            .to(`consultation:${consultationId}`)
            .emit('consultation_status_patient', {
              status: ConsultationStatus.COMPLETED,
              canJoin: false,
              waitingForDoctor: false,
              showRating: true,
            });
        }
      } else {
        client.emit('error', {
          message: 'Failed to end consultation: No response from service',
        });
      }
    } catch (error) {
      this.logger.error(
        `End consultation error: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        message: 'Failed to end consultation',
        details: error.message,
      });
    }
  }

  @SubscribeMessage('rate_consultation')
  async handleRateConsultation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RateConsultationDto,
  ) {
    try {
      const { consultationId, rating, comment } = data;
      const { userId, role } = client.data;

      if (role !== UserRole.PATIENT) {
        throw new Error('Only patients can rate consultations');
      }

      await this.consultationService.rateConsultation(userId, {
        consultationId,
        rating,
        comment,
      });

      this.server
        .to(`consultation:${consultationId}`)
        .emit('consultation_rated', {
          consultationId,
          patientId: userId,
          rating,
        });

      this.server
        .to(`consultation:${consultationId}`)
        .emit('consultation_status_patient', {
          status: ConsultationStatus.COMPLETED,
          canJoin: false,
          waitingForDoctor: false,
          showRating: false,
          rating: {
            value: rating,
            color: rating >= 4 ? 'green' : 'red',
            done: true,
          },
        });
    } catch (error) {
      this.logger.error('Rate consultation failed', error.stack);
      client.emit('error', {
        message: 'Failed to rate consultation',
        details: error.message,
      });
    }
  }

  @SubscribeMessage('consultation_keep_alive')
  async handleKeepAlive(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number },
  ) {
    try {
      const { consultationId } = data;
      const { userId } = client.data;

      const participant = await this.databaseService.participant.findUnique({
        where: { consultationId_userId: { consultationId, userId } },
      });

      if (!participant) {
        return;
      }

      await this.databaseService.participant.update({
        where: { consultationId_userId: { consultationId, userId } },
        data: { lastActiveAt: new Date() },
      });
    } catch {
      // Silently ignore to avoid flooding errors
    }
  }

  @SubscribeMessage('assign_practitioner')
  async handleAssignPractitioner(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; practitionerId: number },
  ) {
    try {
      const { consultationId, practitionerId } = data;
      const { role, userId } = client.data;

      if (role !== UserRole.ADMIN) {
        throw new Error('Only admins can assign practitioners');
      }

      const updated =
        await this.consultationService.assignPractitionerToConsultation(
          consultationId,
          practitionerId,
          userId,
        );

      if (!updated) {
        throw new Error('Failed to assign practitioner');
      }

      this.server
        .to(`consultation:${consultationId}`)
        .emit('practitioner_assigned', {
          consultationId,
          practitionerId,
          message: 'Practitioner assigned to this consultation',
          status: updated.status,
        });

      this.server.to(`practitioner:${practitionerId}`).emit('new_assignment', {
        consultationId,
        message: 'You have been assigned a new consultation',
        status: updated.status,
      });
    } catch (error) {
      this.logger.error('Assign practitioner failed', error.stack);
      client.emit('error', {
        message: 'Failed to assign practitioner',
        details: error.message,
      });
    }
  }

  @SubscribeMessage('media_permission_status')
  async handleMediaPermissionStatus(
    @ConnectedSocket() client: Socket,
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
      const role = client.data.role as UserRole;

      this.server
        .to(`consultation:${consultationId}`)
        .emit('media_permission_status_update', {
          userId,
          role,
          camera,
          microphone,
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      this.logger.error(
        'Error handling media_permission_status event',
        error.stack,
      );
      client.emit('error', {
        message: 'Failed to update media permission status',
      });
    }
  }

  @SubscribeMessage('media_permission_denied')
  async handleMediaPermissionDenied(
    @ConnectedSocket() client: Socket,
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
      const role = client.data.role as UserRole;

      this.logger.warn(
        `User ${userId} (${role}) denied media permissions: camera=${camera}, microphone=${microphone}`,
      );

      this.server
        .to(`consultation:${consultationId}`)
        .except(client.id) // exclude sender if you want
        .emit('media_permission_denied_notification', {
          userId,
          role,
          camera,
          microphone,
          timestamp: new Date().toISOString(),
          message: `User ${userId} has denied permission for ${camera === 'denied' || camera === 'blocked' ? 'camera ' : ''
            }${microphone === 'denied' || microphone === 'blocked'
              ? 'microphone'
              : ''
            }.`,
        });
    } catch (error) {
      this.logger.error(
        'Error handling media_permission_denied event',
        error.stack,
      );
      client.emit('error', {
        message: 'Failed to process media permission denial',
      });
    }
  }

  @SubscribeMessage('client_error')
  async handleClientError(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { consultationId: number; userId: number; errorMessage: string },
  ) {
    const { consultationId, userId, errorMessage } = data;
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
  }

  @SubscribeMessage('client_reconnect')
  async handleClientReconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; userId: number },
  ) {
    try {
      const { consultationId, userId } = data;
      await this.databaseService.participant.updateMany({
        where: { consultationId, userId },
        data: { isActive: true, lastActiveAt: new Date() },
      });
      this.logger.log(
        `Client successful reconnect: user ${userId} consultation ${consultationId}`,
      );

      this.server.to(`consultation:${consultationId}`).emit('system_message', {
        type: 'user_reconnected',
        userId,
        timestamp: new Date().toISOString(),
        message: `User ${userId} reconnected to consultation.`,
      });
    } catch (error) {
      this.logger.error('Handling client_reconnect failed', error.stack);
      client.emit('error', {
        message: 'Failed to process client reconnect',
        details: error.message,
      });
    }
  }

  @SubscribeMessage('request_consultation_state')
  async handleRequestConsultationState(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number },
  ) {
    try {
      const { consultationId } = data;
      const consultation = await this.databaseService.consultation.findUnique({
        where: { id: consultationId },
        include: {
          participants: {
            include: { user: true },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50, // Last 50 messages
          },
        },
      });

      if (!consultation) {
        client.emit('error', { message: 'Consultation not found' });
        return;
      }

      client.emit('consultation_state_update', {
        consultationId,
        status: consultation.status,
        participants: consultation.participants.map((p) => ({
          id: p.user.id,
          name: `${p.user.firstName} ${p.user.lastName}`,
          role: p.user.role,
          isActive: p.isActive,
          inWaitingRoom: p.inWaitingRoom,
        })),
        messages: consultation.messages.map((m) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
          createdAt: m.createdAt,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to get consultation state:', error);
      client.emit('error', { message: 'Failed to get consultation state' });
    }
  }

  @SubscribeMessage('update_participant_status')
  async handleUpdateParticipantStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      consultationId: number;
      userId: number;
      status: 'active' | 'away' | 'busy';
    },
  ) {
    try {
      const { consultationId, userId, status } = data;

      await this.databaseService.participant.updateMany({
        where: { consultationId, userId },
        data: {
          isActive: status === 'active',
          lastActiveAt: new Date(),
        },
      });

      this.server
        .to(`consultation:${consultationId}`)
        .emit('participant_status_changed', {
          consultationId,
          userId,
          status,
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      this.logger.error('Failed to update participant status:', error);
      client.emit('error', { message: 'Failed to update participant status' });
    }
  }

  @SubscribeMessage('typing_indicator')
  async handleTypingIndicator(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      consultationId: number;
      userId: number;
      isTyping: boolean;
    },
  ) {
    const { consultationId, userId, isTyping } = data;

    // Broadcast typing indicator to other participants (exclude sender)
    client.to(`consultation:${consultationId}`).emit('user_typing', {
      consultationId,
      userId,
      isTyping,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('share_screen_request')
  async handleShareScreenRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; userId: number },
  ) {
    try {
      const { consultationId, userId } = data;

      // Check if user has permission to share screen
      const participant = await this.databaseService.participant.findUnique({
        where: { consultationId_userId: { consultationId, userId } },
        include: { user: true },
      });

      if (!participant) {
        client.emit('error', {
          message: 'Not a participant in this consultation',
        });
        return;
      }

      const canShareScreen =
        (participant.user.role as string) === 'PRACTITIONER' ||
        (participant.user.role as string) === 'EXPERT';

      if (!canShareScreen) {
        client.emit('screen_share_denied', {
          reason: 'Permission denied',
          message: 'Only practitioners and experts can share screen',
        });
        return;
      }

      // Notify all participants about screen share request
      this.server
        .to(`consultation:${consultationId}`)
        .emit('screen_share_started', {
          consultationId,
          userId,
          userName: `${participant.user.firstName} ${participant.user.lastName}`,
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      this.logger.error('Failed to handle screen share request:', error);
      client.emit('error', {
        message: 'Failed to process screen share request',
      });
    }
  }

  // ===================================================================
  // ENHANCED MEDIASOUP INTEGRATION WEBSOCKET HANDLERS
  // ===================================================================

  @SubscribeMessage('join_media_session')
  async handleJoinMediaSession(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      consultationId: number;
      userId: number;
      userRole: UserRole;
    },
  ) {
    try {
      const { consultationId, userId, userRole } = data;

      this.logger.log(
        `User ${userId} (${userRole}) requesting to join media session for consultation ${consultationId}`,
      );

      const result =
        await this.consultationMediaSoupService.handleParticipantJoinMedia(
          consultationId,
          userId,
          userRole,
        );

      // Send response back to the requesting client
      client.emit('media_join_response', {
        consultationId,
        success: true,
        ...result,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `User ${userId} media join handled - canJoinMedia: ${result.canJoinMedia}, waitingRoom: ${result.waitingRoomRequired}`,
      );
    } catch (error) {
      this.logger.error('Failed to handle join media session:', error);
      client.emit('media_join_response', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('leave_media_session')
  async handleLeaveMediaSession(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      consultationId: number;
      userId: number;
      userRole: UserRole;
    },
  ) {
    try {
      const { consultationId, userId, userRole } = data;

      this.logger.log(
        `User ${userId} (${userRole}) leaving media session for consultation ${consultationId}`,
      );

      await this.consultationMediaSoupService.handleParticipantLeaveMedia(
        consultationId,
        userId,
        userRole,
      );

      // Send confirmation back to the client
      client.emit('media_leave_response', {
        consultationId,
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to handle leave media session:', error);
      client.emit('media_leave_response', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('request_media_session_status')
  async handleRequestMediaSessionStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number },
  ) {
    try {
      const { consultationId } = data;

      const participantsStatus =
        await this.consultationMediaSoupService.getActiveParticipantsWithMediaStatus(
          consultationId,
        );

      const healthStatus =
        await this.consultationMediaSoupService.getConsultationHealthStatus(
          consultationId,
        );

      client.emit('media_session_status_response', {
        consultationId,
        participants: participantsStatus,
        health: healthStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to get media session status:', error);
      client.emit('media_session_status_response', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('initialize_media_session')
  async handleInitializeMediaSession(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      consultationId: number;
      initiatorUserId: number;
      initiatorRole: UserRole;
    },
  ) {
    try {
      const { consultationId, initiatorUserId, initiatorRole } = data;

      this.logger.log(
        `Initializing media session for consultation ${consultationId} by user ${initiatorUserId} (${initiatorRole})`,
      );

      const result =
        await this.consultationMediaSoupService.initializeMediaSoupSession(
          consultationId,
          initiatorUserId,
          initiatorRole,
        );

      // Broadcast to all participants in the consultation
      this.server
        .to(`consultation:${consultationId}`)
        .emit('media_session_initialized', {
          consultationId,
          ...result,
          initiatedBy: {
            userId: initiatorUserId,
            role: initiatorRole,
          },
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      this.logger.error('Failed to initialize media session:', error);
      client.emit('media_session_initialization_failed', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('transition_consultation_state')
  async handleTransitionConsultationState(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      consultationId: number;
      newStatus: ConsultationStatus;
      initiatorUserId: number;
    },
  ) {
    try {
      const { consultationId, newStatus, initiatorUserId } = data;

      this.logger.log(
        `Transitioning consultation ${consultationId} to ${newStatus} by user ${initiatorUserId}`,
      );

      await this.consultationMediaSoupService.transitionConsultationState(
        consultationId,
        newStatus,
        initiatorUserId,
      );

      // Confirmation is sent via the transitionConsultationState method
      // which emits 'consultation_state_changed' to all participants
    } catch (error) {
      this.logger.error('Failed to transition consultation state:', error);
      client.emit('consultation_state_transition_failed', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('activate_consultation')
  async handleActivateConsultation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ActivateConsultationDto,
  ) {
    try {
      const { consultationId, practitionerId } = data;
      const { userId, role } = client.data;

      // Verify the user has permission to activate consultation
      if (role !== UserRole.PRACTITIONER && userId !== practitionerId) {
        throw new WsException('Unauthorized to activate consultation');
      }

      // Update consultation status to ACTIVE
      const consultation = await this.databaseService.consultation.update({
        where: { id: consultationId },
        data: {
          status: ConsultationStatus.ACTIVE,
          startedAt: new Date()
        },
        include: {
          owner: {
            select: { firstName: true, lastName: true }
          }
        }
      });

      // Mark practitioner as active participant
      await this.databaseService.participant.upsert({
        where: { consultationId_userId: { consultationId, userId: practitionerId } },
        create: {
          consultationId,
          userId: practitionerId,
          role: UserRole.PRACTITIONER,
          isActive: true,
          joinedAt: new Date(),
          lastActiveAt: new Date(),
        },
        update: {
          isActive: true,
          joinedAt: new Date(),
          lastActiveAt: new Date(),
        },
      });

      // Emit consultation activated event to all participants
      this.server.to(`consultation:${consultationId}`).emit('consultation_activated', {
        consultationId,
        practitionerId,
        practitionerName: consultation.owner
          ? `${consultation.owner.firstName} ${consultation.owner.lastName}`
          : 'Practitioner',
        status: ConsultationStatus.ACTIVE,
        timestamp: new Date().toISOString(),
        message: 'Consultation is now active'
      });

      // Send success response to practitioner
      client.emit('consultation_activated_response', {
        success: true,
        consultationId,
        status: ConsultationStatus.ACTIVE,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Consultation ${consultationId} activated by practitioner ${practitionerId}`);

    } catch (error) {
      this.logger.error('Failed to activate consultation:', error);
      client.emit('consultation_activated_response', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('request_participant_media_capabilities')
  async handleRequestParticipantMediaCapabilities(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; userId: number },
  ) {
    try {
      const { consultationId, userId } = data;

      const participant = await this.databaseService.participant.findUnique({
        where: { consultationId_userId: { consultationId, userId } },
        include: {
          user: {
            select: { role: true },
          },
        },
      });

      if (!participant) {
        throw new Error('Participant not found');
      }

      const capabilities =
        await this.consultationUtilityService.getConsultationCapabilities(
          participant.user.role,
          participant.inWaitingRoom,
        );

      client.emit('participant_media_capabilities_response', {
        consultationId,
        userId,
        capabilities,
        inWaitingRoom: participant.inWaitingRoom,
        isActive: participant.isActive,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to get participant media capabilities:', error);
      client.emit('participant_media_capabilities_response', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('smart_patient_join')
  async handleSmartPatientJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      consultationId: number;
      patientId: number;
      joinType: 'magic-link' | 'dashboard' | 'readmission';
    },
  ) {
    try {
      const { consultationId, patientId, joinType } = data;
      const { userId, role } = client.data;

      // Validate that the requesting user is the patient or has permission
      if (
        role !== UserRole.PATIENT &&
        role !== UserRole.PRACTITIONER &&
        role !== UserRole.ADMIN
      ) {
        throw new WsException('Unauthorized to initiate smart patient join');
      }

      if (role === UserRole.PATIENT && userId !== patientId) {
        throw new WsException('Patient can only join for themselves');
      }

      // Call the smart patient join service
      const joinResult = await this.consultationService.smartPatientJoin(
        consultationId,
        patientId,
        joinType,
      );

      if (joinResult.success && joinResult.data) {
        // Emit success response to the requesting client
        client.emit('smart_patient_join_response', {
          success: true,
          consultationId,
          patientId,
          joinType,
          redirectTo: joinResult.data.redirectTo,
          inWaitingRoom: joinResult.data.waitingRoom ? true : false,
          message: joinResult.data.message,
          timestamp: new Date().toISOString(),
        });

        // Emit state change to all participants
        this.server
          .to(`consultation:${consultationId}`)
          .emit('patient_join_state_change', {
            consultationId,
            patientId,
            joinType,
            newState:
              joinResult.data.redirectTo === 'waiting-room'
                ? 'waiting'
                : 'active',
            consultationStatus: joinResult.data.status,
            timestamp: new Date().toISOString(),
          });

        this.logger.log(
          `Smart patient join successful: Patient ${patientId}, JoinType: ${joinType}, Destination: ${joinResult.data.redirectTo}`,
        );
      } else {
        throw new Error(joinResult.message || 'Smart patient join failed');
      }
    } catch (error) {
      this.logger.error('Smart patient join failed:', error);
      client.emit('smart_patient_join_error', {
        error: error.message,
        consultationId: data.consultationId,
        patientId: data.patientId,
        joinType: data.joinType,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('check_patient_admission_status')
  async handleCheckPatientAdmissionStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; patientId: number },
  ) {
    try {
      const { consultationId, patientId } = data;

      // Get consultation and patient status
      const participant = await this.databaseService.participant.findUnique({
        where: { consultationId_userId: { consultationId, userId: patientId } },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          consultation: {
            select: { id: true, status: true, ownerId: true },
          },
        },
      });

      if (!participant) {
        throw new WsException('Patient not found in consultation');
      }

      // Determine appropriate action for patient
      let recommendedAction: 'wait' | 'join-consultation' | 'error' = 'wait';
      let canJoinDirectly = false;

      if (
        participant.consultation.status === ConsultationStatus.ACTIVE &&
        !participant.inWaitingRoom
      ) {
        recommendedAction = 'join-consultation';
        canJoinDirectly = true;
      } else if (
        participant.consultation.status === ConsultationStatus.WAITING ||
        participant.inWaitingRoom
      ) {
        recommendedAction = 'wait';
        canJoinDirectly = false;
      }

      client.emit('patient_admission_status_response', {
        consultationId,
        patientId,
        consultationStatus: participant.consultation.status,
        inWaitingRoom: participant.inWaitingRoom,
        isActive: participant.isActive,
        canJoinDirectly,
        recommendedAction,
        message: canJoinDirectly
          ? 'Patient can join consultation directly'
          : 'Patient needs to wait for admission',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Patient admission status checked: Patient ${patientId}, Status: ${recommendedAction}, CanJoinDirectly: ${canJoinDirectly}`,
      );
    } catch (error) {
      this.logger.error('Failed to check patient admission status:', error);
      client.emit('patient_admission_status_error', {
        error: error.message,
        consultationId: data.consultationId,
        patientId: data.patientId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ================ ENHANCED REALTIME FEATURES ================

  @SubscribeMessage('enter_waiting_room')
  async handleEnterWaitingRoom(@ConnectedSocket() client: Socket) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      const session = await this.enhancedRealtimeService.enterWaitingRoom(
        consultationId,
        userId
      );

      client.emit('waiting_room_entered', {
        session,
        message: 'You have entered the waiting room'
      });

      // Notify practitioners about patient in waiting room
      await this.notifyPractitionersAboutWaitingPatient(consultationId, userId, session);

    } catch (error) {
      this.logger.error(`Enter waiting room error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('get_waiting_room_stats')
  async handleGetWaitingRoomStats(@ConnectedSocket() client: Socket) {
    try {
      const { consultationId } = client.data ?? {};
      if (!consultationId) {
        throw new WsException('Invalid consultation ID');
      }

      const stats = await this.waitingRoomService.getWaitingRoomStats(consultationId);
      client.emit('waiting_room_stats', stats);

    } catch (error) {
      this.logger.error(`Get waiting room stats error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('update_media_device_status')
  async handleUpdateMediaDeviceStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UpdateMediaDeviceStatusDto
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      const deviceStatus = await this.enhancedRealtimeService.updateMediaDeviceStatus(
        consultationId,
        userId,
        data
      );

      // Notify all participants about device status change
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('media_device_status_updated', {
        userId: userId,
        deviceStatus,
        consultationId: consultationId
      });

    } catch (error) {
      this.logger.error(`Update media device status error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('update_connection_quality')
  async handleUpdateConnectionQuality(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UpdateConnectionQualityDto
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      const connectionQuality = await this.enhancedRealtimeService.updateConnectionQuality(
        consultationId,
        userId,
        data
      );

      // Store current quality for monitoring
      this.userConnectionQuality.set(client.id, {
        ...data,
        timestamp: new Date()
      });

      // Notify practitioners about poor connection quality
      if (data.signalStrength && data.signalStrength < 30) {
        await this.notifyPractitionersAboutPoorConnection(consultationId, userId, data);
      }

      client.emit('connection_quality_updated', connectionQuality);

    } catch (error) {
      this.logger.error(`Update connection quality error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('send_enhanced_message')
  async handleSendEnhancedMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendEnhancedMessageDto
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      // Convert to ChatService format
      const createMessageDto = {
        userId,
        consultationId,
        content: data.content,
        messageType: (data.messageType as MessageType) || MessageType.TEXT,
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        clientUuid: `msg_${Date.now()}_${userId}`
      };

      const message = await this.chatService.createMessage(createMessageDto);

      // Create real-time event
      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
        eventType: 'new_message',
        eventData: {
          messageId: message.id,
          messageType: message.messageType,
          hasMedia: !!message.mediaUrl
        }
      });

      // Broadcast message to all participants
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('enhanced_message_received', {
        message,
        consultationId,
        senderId: userId
      });

    } catch (error) {
      this.logger.error(`Send enhanced message error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('update_typing_indicator_enhanced')
  async handleUpdateTypingIndicatorEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UpdateTypingIndicatorDto
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      await this.enhancedRealtimeService.updateTypingIndicator(
        consultationId,
        userId,
        data
      );

      // Broadcast typing indicator to other participants
      const roomName = `consultation:${consultationId}`;
      client.to(roomName).emit('typing_indicator_updated', {
        userId,
        isTyping: data.isTyping,
        consultationId
      });

    } catch (error) {
      this.logger.error(`Update typing indicator error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('add_participant_enhanced')
  async handleAddParticipantEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      role: UserRole;
      email: string;
      firstName: string;
      lastName: string;
      notes?: string
    }
  ) {
    try {
      const { consultationId, userId, role } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      if (role !== UserRole.PRACTITIONER) {
        throw new WsException('Only practitioners can add participants');
      }

      const invitation = await this.invitationService.createInvitationEmail(
        consultationId,
        userId,
        data.email,
        data.role,
        `${data.firstName} ${data.lastName}`,
        data.notes
      );

      // Create real-time event
      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
        eventType: 'participant_invited',
        message: `${data.firstName} ${data.lastName} (${data.role.toLowerCase()}) has been invited to join`,
        eventData: {
          invitationId: invitation.id,
          participantName: `${data.firstName} ${data.lastName}`,
          role: data.role,
          email: data.email
        }
      });

      // Notify all participants
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('participant_invited', {
        email: data.email,
        role: data.role,
        invitationId: invitation.id,
        addedBy: userId,
        consultationId
      });

    } catch (error) {
      this.logger.error(`Add participant error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('remove_participant_enhanced')
  async handleRemoveParticipantEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { participantUserId: number }
  ) {
    try {
      const { consultationId, userId, role } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      if (role !== UserRole.PRACTITIONER) {
        throw new WsException('Only practitioners can remove participants');
      }

      await this.enhancedRealtimeService.removeParticipant(
        consultationId,
        data.participantUserId,
        userId
      );

      // Notify the removed participant
      const participantSocket = this.findClientByUser(consultationId, data.participantUserId);
      if (participantSocket) {
        participantSocket.emit('removed_from_consultation', {
          message: 'You have been removed from the consultation',
          removedBy: userId,
          consultationId
        });
        participantSocket.disconnect();
      }

      // Notify remaining participants
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('participant_removed', {
        participantUserId: data.participantUserId,
        removedBy: userId,
        consultationId
      });

    } catch (error) {
      this.logger.error(`Remove participant error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('media_permission_error_enhanced')
  async handleMediaPermissionErrorEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { errorType: string; errorMessage: string }
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
        eventType: 'media_permission_error',
        message: data.errorMessage,
        eventData: { errorType: data.errorType }
      });

      // Notify practitioners about the media permission error
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('media_permission_error_occurred', {
        userId,
        errorType: data.errorType,
        errorMessage: data.errorMessage,
        consultationId
      });

    } catch (error) {
      this.logger.error(`Media permission error handling error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('create_system_notification_enhanced')
  async handleCreateSystemNotificationEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationType: string; message: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' }
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
        eventType: 'system_notification',
        message: data.message,
        eventData: {
          notificationType: data.notificationType,
          priority: data.priority
        }
      });

      // Broadcast system notification
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('system_notification_created', {
        notificationType: data.notificationType,
        message: data.message,
        priority: data.priority,
        createdBy: userId,
        consultationId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error(`Create system notification error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  // ================ NEW WAITING ROOM WEBSOCKET HANDLERS ================

  @SubscribeMessage('join_waiting_room_enhanced')
  async handleJoinWaitingRoomEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; userId: number; preferredLanguage?: string }
  ) {
    try {
      const result = await this.waitingRoomService.joinWaitingRoom({
        consultationId: data.consultationId,
        userId: data.userId,
        preferredLanguage: data.preferredLanguage
      });

      client.emit('waiting_room_joined', {
        success: result.success,
        waitingRoomSession: result.waitingRoomSession,
        message: 'Successfully joined waiting room'
      });

      // Notify practitioners about new patient in waiting room
      const consultationId = result.waitingRoomSession.consultationId;
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('patient_entered_waiting_room', {
        waitingRoomSession: result.waitingRoomSession,
        patientId: data.userId,
        joinedAt: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error(`Join waiting room enhanced error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('admit_from_waiting_room_enhanced')
  async handleAdmitFromWaitingRoomEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; patientId: number; welcomeMessage?: string }
  ) {
    try {
      const { consultationId, userId, role } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      if (role !== UserRole.PRACTITIONER) {
        throw new WsException('Only practitioners can admit patients from waiting room');
      }

      const result = await this.waitingRoomService.admitPatientFromWaitingRoom(
        {
          consultationId: data.consultationId,
          patientId: data.patientId,
          welcomeMessage: data.welcomeMessage
        },
        userId
      );

      // Notify patient they've been admitted to live consultation
      const patientSocket = this.findClientByUser(consultationId, data.patientId);
      if (patientSocket) {
        patientSocket.emit('admitted_to_live_consultation', {
          message: data.welcomeMessage || 'You have been admitted to the live consultation',
          consultationId: data.consultationId,
          admittedBy: userId,
          admittedAt: new Date().toISOString()
        });
      }

      // Notify all practitioners
      const roomName = `consultation:${data.consultationId}`;
      this.server.to(roomName).emit('patient_admitted_from_waiting_room', {
        patientId: data.patientId,
        consultationId: data.consultationId,
        admittedBy: userId,
        success: result.success
      });

    } catch (error) {
      this.logger.error(`Admit from waiting room enhanced error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('join_live_consultation_enhanced')
  async handleJoinLiveConsultationEnhanced(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number; userId: number; role: UserRole }
  ) {
    try {
      const liveConsultationData = await this.waitingRoomService.joinLiveConsultation({
        consultationId: data.consultationId,
        userId: data.userId,
        role: data.role
      });

      client.emit('live_consultation_joined', {
        liveConsultationData,
        message: 'Successfully joined live consultation'
      });

      // Notify other participants about new participant
      const roomName = `consultation:${data.consultationId}`;
      client.to(roomName).emit('participant_joined_live', {
        userId: data.userId,
        userRole: data.role,
        consultationId: data.consultationId,
        joinedAt: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error(`Join live consultation enhanced error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('get_practitioner_waiting_room')
  async handleGetPractitionerWaitingRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { practitionerId: number }
  ) {
    try {
      const { consultationId, userId, role } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      if (role !== UserRole.PRACTITIONER) {
        throw new WsException('Only practitioners can access waiting room dashboard');
      }

      const waitingRoomData = await this.waitingRoomService.getPractitionerWaitingRoom(data.practitionerId);

      client.emit('practitioner_waiting_room_data', {
        waitingRoomData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error(`Get practitioner waiting room error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('waiting_room_heartbeat')
  async handleWaitingRoomHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { waitingRoomSessionId: number; patientId: number }
  ) {
    try {
      // Update timestamp for waiting room session
      await this.databaseService.waitingRoomSession.update({
        where: { id: data.waitingRoomSessionId },
        data: { updatedAt: new Date() }
      });

      client.emit('waiting_room_heartbeat_ack', {
        sessionId: data.waitingRoomSessionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error(`Waiting room heartbeat error: ${error.message}`);
      client.emit('error', { message: error.message });
    }
  }

  // Helper methods for enhanced features
  private findClientByUser(consultationId: number, userId: number): Socket | undefined {
    for (const [clientId, client] of this.connectedClients) {
      if (client.userId === userId && client.consultationId === consultationId) {
        return client;
      }
    }
    return undefined;
  }

  private async notifyPractitionersAboutWaitingPatient(consultationId: number, patientId: number, session: any) {
    try {
      const practitioners = await this.databaseService.participant.findMany({
        where: {
          consultationId,
          role: UserRole.PRACTITIONER,
          isActive: true
        },
        include: { user: true }
      });

      for (const practitioner of practitioners) {
        const practitionerSocket = this.findClientByUser(consultationId, practitioner.userId);
        if (practitionerSocket) {
          practitionerSocket.emit('patient_in_waiting_room', {
            patientId,
            session,
            consultationId,
            message: 'A patient is waiting in the waiting room'
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to notify practitioners about waiting patient: ${error.message}`);
    }
  }

  private async notifyPractitionersAboutPoorConnection(consultationId: number, userId: number, connectionData: any) {
    try {
      const practitioners = await this.databaseService.participant.findMany({
        where: {
          consultationId,
          role: UserRole.PRACTITIONER,
          isActive: true
        }
      });

      for (const practitioner of practitioners) {
        const practitionerSocket = this.findClientByUser(consultationId, practitioner.userId);
        if (practitionerSocket) {
          practitionerSocket.emit('poor_connection_detected', {
            affectedUserId: userId,
            connectionData,
            consultationId,
            message: 'Poor connection quality detected for a participant'
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to notify practitioners about poor connection: ${error.message}`);
    }
  }

  emitToRoom(consultationId: number, event: string, data: any): void {
    this.server.to(`consultation:${consultationId}`).emit(event, data);
  }

  emitToUser(userId: number, event: string, data: any): void {
    // Emit to multiple possible user room patterns for compatibility with
    try {
      this.server.to(`user-${userId}`).emit(event, data);
      this.server.to(`practitioner:${userId}`).emit(event, data);
      this.server.to(`patient:${userId}`).emit(event, data);
      this.server.to(`user:${userId}`).emit(event, data);
    } catch (e) {
      this.logger.warn(`emitToUser encountered an error emitting to user ${userId}: ${e.message}`);
    }
  }

  /**
   * Update client last seen timestamp
   */
  private updateClientLastSeen(clientId: string): void {
    this.clientLastSeen.set(clientId, new Date());
  }

  /**
   * Start client heartbeat monitoring
   */
  private startClientHeartbeat(clientId: string, client: Socket): void {
    this.stopClientHeartbeat(clientId);

    const heartbeatInterval = setInterval(() => {
      if (client.connected) {
        client.emit('heartbeat', { timestamp: new Date().toISOString() });
        this.updateClientLastSeen(clientId);
      } else {
        this.stopClientHeartbeat(clientId);
      }
    }, 30000);

    this.clientHeartbeat.set(clientId, heartbeatInterval);
  }

  /**
   * Stop client heartbeat monitoring
   */
  private stopClientHeartbeat(clientId: string): void {
    const heartbeat = this.clientHeartbeat.get(clientId);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.clientHeartbeat.delete(clientId);
    }
  }

  /**
   * Reset connection retry attempts
   */
  private resetConnectionRetryAttempts(clientId: string): void {
    this.connectionRetryAttempts.set(clientId, 0);
  }

  /**
   * Increment connection retry attempts
   */
  private incrementConnectionRetryAttempts(clientId: string): number {
    const current = this.connectionRetryAttempts.get(clientId) || 0;
    const newCount = current + 1;
    this.connectionRetryAttempts.set(clientId, newCount);
    return newCount;
  }

  /**
   * Handle connection quality updates from clients
   */
  @SubscribeMessage('connection_quality_update')
  async handleConnectionQualityUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { quality: 'good' | 'fair' | 'poor'; latency?: number; packetLoss?: number }
  ) {
    try {
      const { consultationId, userId } = client.data || {};
      if (!consultationId || !userId) return;

      const qualityData = {
        ...data,
        timestamp: new Date().toISOString(),
        clientId: client.id
      };

      this.userConnectionQuality.set(client.id, qualityData);

      client.to(`consultation:${consultationId}`).emit('participant_connection_quality', {
        userId,
        quality: data.quality,
        timestamp: qualityData.timestamp
      });

      // If connection is poor, provide guidance
      if (data.quality === 'poor') {
        client.emit('connection_guidance', {
          message: 'Your connection quality is poor. Consider moving closer to your router or switching to a wired connection.',
          suggestions: [
            'Check your internet connection',
            'Close other applications using bandwidth',
            'Move closer to your WiFi router',
            'Switch to wired connection if possible'
          ]
        });
      }

    } catch (error) {
      this.logger.error(`Failed to handle connection quality update:`, error);
    }
  }


  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendEnhancedMessageDto
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      // Convert to ChatService format
      const createMessageDto = {
        userId,
        consultationId,
        content: data.content,
        messageType: (data.messageType as MessageType) || MessageType.TEXT,
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        clientUuid: `msg_${Date.now()}_${userId}`
      };

      const message = await this.chatService.createMessage(createMessageDto);

      // Create real-time event
      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
        eventType: 'new_message',
        eventData: {
          messageId: message.id,
          messageType: message.messageType,
          hasMedia: !!message.mediaUrl
        }
      });

      // Broadcast message to all participants
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('new_message', {
        message,
        consultationId,
        senderId: userId
      });

    } catch (error) {
      const errMsg = typeof error === 'object' && error && 'message' in error ? (error as any).message : String(error);
      this.logger.error(`Send message error: ${errMsg}`);
      client.emit('error', { message: errMsg });
    }
  }

  @SubscribeMessage('add_participant')
  async handleAddParticipant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      role: UserRole;
      email: string;
      firstName: string;
      lastName: string;
      notes?: string
    }
  ) {
    try {
      const { consultationId, userId, role } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      if (role !== UserRole.PRACTITIONER) {
        throw new WsException('Only practitioners can add participants');
      }

      // Use existing invitation service
      const invitation = await this.invitationService.createInvitationEmail(
        consultationId,
        userId,
        data.email.trim().toLowerCase(),
        data.role,
        `${data.firstName} ${data.lastName}`,
        data.notes
      );

      // Notify all participants about new invitation
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('participant_invited', {
        invitationId: invitation.id,
        participantName: `${data.firstName} ${data.lastName}`,
        role: data.role,
        consultationId: consultationId,
        invitedBy: userId
      });

      client.emit('add_participant_success', {
        invitationId: invitation.id,
        magicLink: `${process.env.FRONTEND_URL}/join/${invitation.token}`
      });

    } catch (error) {
      const errMsg = typeof error === 'object' && error && 'message' in error ? (error as any).message : String(error);
      this.logger.error(`Add participant error: ${errMsg}`);
      client.emit('error', { message: errMsg });
    }
  }

  @SubscribeMessage('remove_participant')
  async handleRemoveParticipant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { participantId: number; reason?: string }
  ) {
    try {
      const { consultationId, userId, role } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      if (role !== UserRole.PRACTITIONER) {
        throw new WsException('Only practitioners can remove participants');
      }

      // Update participant status to inactive
      await this.databaseService.participant.updateMany({
        where: {
          consultationId,
          userId: data.participantId
        },
        data: {
          isActive: false,
          lastActiveAt: new Date()
        }
      });

      // Notify the removed participant
      const removedSocket = this.findClientByUser(consultationId, data.participantId);
      if (removedSocket) {
        removedSocket.emit('participant_removed', {
          reason: data.reason || 'Removed from consultation',
          consultationId: consultationId
        });
        removedSocket.disconnect();
      }

      // Notify other participants
      const roomName = `consultation:${consultationId}`;
      client.to(roomName).emit('participant_removed_notification', {
        participantId: data.participantId,
        consultationId: consultationId,
        removedBy: userId
      });

    } catch (error) {
      const errMsg = typeof error === 'object' && error && 'message' in error ? (error as any).message : String(error);
      this.logger.error(`Remove participant error: ${errMsg}`);
      client.emit('error', { message: errMsg });
    }
  }

  @SubscribeMessage('media_permission_error')
  async handleMediaPermissionError(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { errorType: string; errorDetails?: any }
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      // Log the media permission error
      this.logger.warn(`Media permission error for user ${userId} in consultation ${consultationId}: ${data.errorType}`, data.errorDetails);

      // Send guidance back to the client
      client.emit('media_permission_guidance', {
        errorType: data.errorType,
        message: this.getMediaErrorGuidance(data.errorType),
        consultationId: consultationId
      });

    } catch (error) {
      const errMsg = typeof error === 'object' && error && 'message' in error ? (error as any).message : String(error);
      this.logger.error(`Media permission error handling failed: ${errMsg}`);
    }
  }

  @SubscribeMessage('toggle_video')
  async handleToggleVideo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { enabled: boolean; participantId: string }
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      // Create real-time event for video toggle
      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
        eventType: 'video_toggled',
        message: `Video ${data.enabled ? 'enabled' : 'disabled'}`,
        eventData: { enabled: data.enabled, participantId: data.participantId }
      });

      // Broadcast to all participants in the consultation
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('participant_video_toggled', {
        participantId: data.participantId,
        userId: userId,
        enabled: data.enabled,
        consultationId: consultationId,
        timestamp: new Date().toISOString()
      });

      this.logger.debug(`Video toggled for user ${userId} in consultation ${consultationId}: ${data.enabled}`);

    } catch (error) {
      const errMsg = typeof error === 'object' && error && 'message' in error ? (error as any).message : String(error);
      this.logger.error(`Toggle video error: ${errMsg}`);
    }
  }

  @SubscribeMessage('toggle_audio')
  async handleToggleAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { enabled: boolean; participantId: string }
  ) {
    try {
      const { consultationId, userId } = client.data ?? {};
      if (!consultationId || !userId) {
        throw new WsException('Invalid client state');
      }

      // Create real-time event for audio toggle
      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
        eventType: 'audio_toggled',
        message: `Audio ${data.enabled ? 'enabled' : 'disabled'}`,
        eventData: { enabled: data.enabled, participantId: data.participantId }
      });

      // Broadcast to all participants in the consultation
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('participant_audio_toggled', {
        participantId: data.participantId,
        userId: userId,
        enabled: data.enabled,
        consultationId: consultationId,
        timestamp: new Date().toISOString()
      });

      this.logger.debug(`Audio toggled for user ${userId} in consultation ${consultationId}: ${data.enabled}`);

    } catch (error) {
      const errMsg = typeof error === 'object' && error && 'message' in error ? (error as any).message : String(error);
      this.logger.error(`Toggle audio error: ${errMsg}`);
    }
  }

  @SubscribeMessage('create_system_notification')
  async handleCreateSystemNotification(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageType: string; messageData: any }
  ) {
    try {
      const { consultationId } = client.data ?? {};
      if (!consultationId) {
        throw new WsException('Invalid client state');
      }

      // Create real-time event for system notification
      await this.enhancedRealtimeService.createRealTimeEvent(consultationId, null, {
        eventType: 'system_notification',
        message: `System notification: ${data.messageType}`,
        eventData: data.messageData
      });

      // Broadcast system notification to all participants
      const roomName = `consultation:${consultationId}`;
      this.server.to(roomName).emit('system_notification', {
        messageType: data.messageType,
        messageData: data.messageData,
        consultationId: consultationId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const errMsg = typeof error === 'object' && error && 'message' in error ? (error as any).message : String(error);
      this.logger.error(`System notification error: ${errMsg}`);
    }
  }


  private getMediaErrorGuidance(errorType: string): string {
    switch (errorType) {
      case 'camera_denied':
      case 'microphone_denied':
        return 'Click the camera icon in your browser address bar and select "Allow" for camera and microphone access.';
      case 'device_unavailable':
        return 'Make sure your camera and microphone are properly connected and try refreshing the page.';
      case 'device_in_use':
        return 'Close other video conferencing applications (Zoom, Teams, etc.) and refresh the page.';
      default:
        return 'Try refreshing the page or contact support if the problem persists.';
    }
  }
}
