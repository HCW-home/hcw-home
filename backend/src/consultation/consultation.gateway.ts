import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationService } from './consultation.service';
import { EndConsultationDto } from './dto/end-consultation.dto';
import { RateConsultationDto } from './dto/rate-consultation.dto';
import { ConsultationStatus, UserRole } from '@prisma/client';
import { forwardRef, Inject } from '@nestjs/common';
import { MediasoupSessionService } from 'src/mediasoup/mediasoup-session.service';

@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => ConsultationService))
    private readonly consultationService: ConsultationService,
    @Inject(forwardRef(() => MediasoupSessionService))
    private readonly mediasoupSessionService: MediasoupSessionService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const cId = Number(client.handshake.query.consultationId);
      const uId = Number(client.handshake.query.userId);
      const role = client.handshake.query.role as UserRole | undefined;

      if (
        !cId ||
        !uId ||
        (role !== UserRole.PRACTITIONER && role !== UserRole.PATIENT)
      ) {
        client.emit('error', { message: 'Invalid connection parameters.' });
        client.disconnect();
        return;
      }

      // Only one active user per role per consultation
      const existing = await this.databaseService.participant.findMany({
        where: {
          consultationId: cId,
          isActive: true,
          user: { role },
        },
      });
      if (existing.length > 0 && !existing.some((p) => p.userId === uId)) {
        client.emit('error', {
          message: `A ${role.toLowerCase()} is already connected to this consultation.`,
        });
        client.disconnect();
        return;
      }

      client.join(`consultation:${cId}`);
      client.data = { consultationId: cId, userId: uId, role };
      if (role === UserRole.PRACTITIONER) {
        client.join(`practitioner:${uId}`);
      }

      await this.databaseService.participant.upsert({
        where: { consultationId_userId: { consultationId: cId, userId: uId } },
        create: {
          consultationId: cId,
          userId: uId,
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

      // Doctor joined event for patients
      if (role === UserRole.PRACTITIONER) {
        try {
          const patientParticipants =
            await this.databaseService.participant.findMany({
              where: {
                consultationId: cId,
                user: { role: UserRole.PATIENT },
              },
            });
          for (const part of patientParticipants) {
            this.server.to(`consultation:${cId}`).emit('doctor_joined', {
              consultationId: cId,
              practitionerId: uId,
              message: 'Doctor has joined. You can join the consultation.',
            });
          }
        } catch (err) {
            console.error(`Error emitting doctor_joined event for consultation ${cId}:`, err);
        }
      }

      // For patient, send initial consultation status
      if (role === UserRole.PATIENT) {
        try {
          const consultation =
            await this.databaseService.consultation.findUnique({
              where: { id: cId },
              include: { owner: true, rating: true },
            });
          if (consultation) {
            let canJoin = false;
            let waitingForDoctor = false;
            if (consultation.status === ConsultationStatus.ACTIVE) {
              canJoin = true;
            } else if (consultation.status === ConsultationStatus.WAITING) {
              waitingForDoctor = true;
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
        } catch (err) {
          console.error(`Error fetching consultation status for patient ${uId}:`, err);
        }
      }
    } catch (error) {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const { consultationId, userId, role } = client.data;
      if (!consultationId || !userId || !role) return;

      await this.databaseService.participant.updateMany({
        where: { consultationId, userId },
        data: { isActive: false, lastActiveAt: new Date() },
      });

      const consultation = await this.databaseService.consultation.findUnique({
        where: { id: consultationId },
      });

      if (
        !consultation ||
        consultation.status === ConsultationStatus.TERMINATED_OPEN ||
        consultation.status === ConsultationStatus.COMPLETED
      ) {
        return;
      }

      // Practitoner disconnects: terminate and cleanup Mediasoup
      if (role === UserRole.PRACTITIONER) {
        await this.databaseService.consultation.update({
          where: { id: consultationId },
          data: { status: ConsultationStatus.TERMINATED_OPEN },
        });

        let mediasoupCleaned = false;
        try {
          await this.mediasoupSessionService.cleanupRouterForConsultation(
            consultationId,
          );
          mediasoupCleaned = true;
        } catch {}
        this.server
          .to(`consultation:${consultationId}`)
          .emit('media_session_closed', { consultationId, mediasoupCleaned });

        this.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_status', {
            status: ConsultationStatus.TERMINATED_OPEN,
            terminatedBy: 'PRACTITIONER',
          });
      }
      // All patients gone: can revert to SCHEDULED if in waiting
      else if (role === UserRole.PATIENT) {
        const activePatients = await this.databaseService.participant.findMany({
          where: {
            consultationId,
            isActive: true,
            user: { role: UserRole.PATIENT },
          },
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
              triggeredBy: 'PATIENT_LEFT',
            });
        }
      }
    } catch (error) {
      console.error(`Error during disconnect for user ${client.data?.userId} in consultation ${client.data?.consultationId}:`, error);
    }
  }

  @SubscribeMessage('admit_patient')
  async handleAdmitPatient(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consultationId: number },
  ) {
    try {
      const { consultationId } = data;
      const { role } = client.data;

      if (role !== UserRole.PRACTITIONER) {
        throw new Error('Only practitioners can admit patients');
      }

      await this.databaseService.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.ACTIVE },
      });

      // Ensure Mediasoup router exists (optional if handled in service)
      let mediasoupRouter =
        this.mediasoupSessionService.getRouter(consultationId);
      if (!mediasoupRouter) {
        await this.mediasoupSessionService.createRouterForConsultation(
          consultationId,
        );
        this.server
          .to(`consultation:${consultationId}`)
          .emit('media_session_live', { consultationId });
      }

      this.server
        .to(`consultation:${consultationId}`)
        .emit('consultation_status', {
          status: ConsultationStatus.ACTIVE,
          initiatedBy: 'PRACTITIONER',
        });

      this.server
        .to(`consultation:${consultationId}`)
        .emit('consultation_status_patient', {
          status: ConsultationStatus.ACTIVE,
          canJoin: true,
          waitingForDoctor: false,
        });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to admit patient',
        details: error?.message ?? error,
      });
    }
  }

  @SubscribeMessage('end_consultation')
  async handleEndConsultation(
    @ConnectedSocket() client: Socket,
    @MessageBody() endDto: EndConsultationDto,
  ) {
    try {
      const { consultationId, action } = endDto;
      const { userId, role } = client.data;

      if (role !== UserRole.PRACTITIONER && role !== UserRole.ADMIN) {
        throw new Error('Only practitioners or admins can end consultations');
      }

      const result = await this.consultationService.endConsultation(
        endDto,
        userId,
      );

      if (result.data) {
        this.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_ended', {
            status: result.data.status,
            action,
            terminatedBy: userId,
            ...(result.data.deletionScheduledAt && {
              deletionTime: result.data.deletionScheduledAt,
            }),
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
          message: 'Failed to end consultation: No data returned',
        });
      }
    } catch (error) {
      client.emit('error', {
        message: 'Failed to end consultation',
        details: error?.message ?? error,
      });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { consultationId: number; userId: number; content: string },
  ) {
    try {
      if (
        !data.content ||
        typeof data.content !== 'string' ||
        data.content.trim().length === 0 ||
        data.content.length > 2000
      ) {
        return;
      }

      const message = await this.databaseService.message.create({
        data: {
          consultationId: data.consultationId,
          userId: data.userId,
          content: data.content,
        },
      });

      this.server
        .to(`consultation:${data.consultationId}`)
        .emit('new_message', {
          id: message.id,
          userId: data.userId,
          content: data.content,
          timestamp: new Date().toISOString(),
          role: client.data.role,
        });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to send message',
        details: error?.message ?? error,
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
      client.emit('error', {
        message: 'Failed to rate consultation',
        details: error?.message ?? error,
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
        where: {
          consultationId_userId: {
            consultationId,
            userId,
          },
        },
      });

      if (!participant) {
        throw new Error('Participant not found');
      }

      await this.databaseService.participant.update({
        where: {
          consultationId_userId: {
            consultationId,
            userId,
          },
        },
        data: {
          lastActiveAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`KeepAlive error for user ${client.data?.userId} in consultation ${data.consultationId}:`, error);
      // intentionally no emit for keep_alive errors to avoid flooding
    }
  }
}
