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
@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => ConsultationService))
    private readonly consultationService: ConsultationService,
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
        console.error(
          `[ConsultationGateway][handleConnection] Invalid connection params: consultationId=${cId}, userId=${uId}, role=${role}`,
        );
        client.emit('error', {
          message: 'Invalid connection parameters.',
        });
        client.disconnect();
        return;
      }

      // Enforce one-to-one: only one active user per role per consultation
      const existing = await this.databaseService.participant.findMany({
        where: {
          consultationId: cId,
          isActive: true,
          user: { role },
        },
      });

      if (existing.length > 0 && !existing.some((p) => p.userId === uId)) {
        console.error(
          `[ConsultationGateway][handleConnection] Another ${role} is already active in consultation ${cId}`,
        );
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

      // Notify patients when doctor joins
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
          console.error(
            `[ConsultationGateway][handleConnection] Error notifying patients doctor joined:`,
            err,
          );
        }
      }

      // For patient, send initial consultation status
      if (role === UserRole.PATIENT) {
        try {
          const consultation =
            await this.databaseService.consultation.findUnique({
              where: { id: cId },
              include: {
                owner: true,
                rating: true,
              },
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
          console.error(
            `[ConsultationGateway][handleConnection] Error sending patient initial status:`,
            err,
          );
        }
      }

      console.log(
        `[ConsultationGateway][handleConnection] User ${uId} (${role}) connected to consultation ${cId}`,
      );
    } catch (error) {
      console.error(`[ConsultationGateway][handleConnection] Error:`, error);
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

      if (role === UserRole.PRACTITIONER) {
        await this.databaseService.consultation.update({
          where: { id: consultationId },
          data: { status: ConsultationStatus.TERMINATED_OPEN },
        });

        this.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_status', {
            status: ConsultationStatus.TERMINATED_OPEN,
            terminatedBy: 'PRACTITIONER',
          });

        console.log(
          `[ConsultationGateway][handleDisconnect] Practitioner ${userId} disconnected — consultation ${consultationId} auto-terminated.`,
        );
      } else if (role === UserRole.PATIENT) {
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

          console.log(
            `[ConsultationGateway][handleDisconnect] All patients left — consultation ${consultationId} reverted to SCHEDULED.`,
          );
        }
      }

      console.log(
        `[ConsultationGateway][handleDisconnect] ${role} ${userId} disconnected from consultation ${consultationId}`,
      );
    } catch (error) {
      console.error(`[ConsultationGateway][handleDisconnect] Error:`, error);
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
        console.error(
          `[ConsultationGateway][handleAdmitPatient] Forbidden: Only practitioners can admit patients`,
        );
        throw new Error('Only practitioners can admit patients');
      }

      await this.databaseService.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.ACTIVE },
      });

      this.server
        .to(`consultation:${consultationId}`)
        .emit('consultation_status', {
          status: ConsultationStatus.ACTIVE,
          initiatedBy: 'PRACTITIONER',
        });

      // Notify patients they can now join
      this.server
        .to(`consultation:${consultationId}`)
        .emit('consultation_status_patient', {
          status: ConsultationStatus.ACTIVE,
          canJoin: true,
          waitingForDoctor: false,
        });

      console.log(
        `[ConsultationGateway][handleAdmitPatient] Consultation ${consultationId} set to ACTIVE by practitioner`,
      );
    } catch (error) {
      console.error(`[ConsultationGateway][handleAdmitPatient] Error:`, error);
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
        console.error(
          `[ConsultationGateway][end_consultation] Forbidden: Only practitioners or admins can end consultations`,
        );
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

        // Notify patients for rating if completed
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

        console.log(
          `[ConsultationGateway][end_consultation] Consultation ${consultationId} ended by ${userId} with action ${action}`,
        );
      } else {
        console.error(
          `[ConsultationGateway][end_consultation] Failed: No data returned`,
        );
        client.emit('error', {
          message: 'Failed to end consultation: No data returned',
        });
      }
    } catch (error) {
      console.error(`[ConsultationGateway][end_consultation] Error:`, error);
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
        console.error(
          `[ConsultationGateway][send_message] Invalid message content from user ${data.userId} in consultation ${data.consultationId}`,
        );
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

      console.log(
        `[ConsultationGateway][send_message] User ${data.userId} sent message in consultation ${data.consultationId}`,
      );
    } catch (error) {
      console.error(`[ConsultationGateway][send_message] Error:`, error);
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
        console.error(
          `[ConsultationGateway][rate_consultation] Forbidden: Only patients can rate consultations`,
        );
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

      // Optionally: update patient dashboard in real-time
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

      console.log(
        `[ConsultationGateway][rate_consultation] Patient ${userId} rated consultation ${consultationId} with ${rating}`,
      );
    } catch (error) {
      console.error(`[ConsultationGateway][rate_consultation] Error:`, error);
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
        console.error(
          `[ConsultationGateway][keep_alive] Participant not found for consultation ${consultationId}, user ${userId}`,
        );
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

      // No log for keep_alive to avoid flooding logs
    } catch (error) {
      console.error(`[ConsultationGateway][keep_alive] Error:`, error);
    }
  }
}
