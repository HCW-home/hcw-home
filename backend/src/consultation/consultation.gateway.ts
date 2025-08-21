import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject, Logger, UseGuards } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { DatabaseService } from '../database/database.service';
import { MediasoupSessionService } from '../mediasoup/mediasoup-session.service';
import { ConsultationStatus, UserRole } from '@prisma/client';
import { EndConsultationDto } from './dto/end-consultation.dto';
import { RateConsultationDto } from './dto/rate-consultation.dto';
import { ConsultationInvitationService } from './consultation-invitation.service';

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

@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ConsultationGateway.name);
  private clientRooms = new Map<string, number>();
  private clientTransports = new Map<string, Set<string>>();
  private clientProducers = new Map<string, Set<string>>();
  private clientConsumers = new Map<string, Set<string>>();

  private joinNotificationDebounce = new Map<string, number>();

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => ConsultationService))
    private readonly consultationService: ConsultationService,
    @Inject(forwardRef(() => MediasoupSessionService))
    private readonly mediasoupSessionService: MediasoupSessionService,
    @Inject(forwardRef(() => ConsultationInvitationService))
    private readonly invitationService: ConsultationInvitationService,
  ) {}

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

      client.data = { consultationId, userId, role };
      this.clientRooms.set(client.id, consultationId);
      this.clientTransports.set(client.id, new Set());
      this.clientProducers.set(client.id, new Set());
      this.clientConsumers.set(client.id, new Set());

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

      const nowISO = new Date().toISOString();

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
    @MessageBody() data: { consultationId: number },
  ) {
    try {
      const { consultationId } = data;
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

        this.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_status', {
            status: ConsultationStatus.ACTIVE,
            initiatedBy: role,
          });

        this.server
          .to(`consultation:${consultationId}`)
          .emit('media_session_live', { consultationId });
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
      const userId = client.data.user.id;
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
          message: `User ${userId} has denied permission for ${
            camera === 'denied' || camera === 'blocked' ? 'camera ' : ''
          }${
            microphone === 'denied' || microphone === 'blocked'
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
}
