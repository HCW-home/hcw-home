import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../src/database/database.service';
import { ConsultationStatus, MessageService } from '@prisma/client';
import { NotificationService } from '../notifications/notifications.service';
import { ConsultationGateway } from './consultation.gateway';

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationService: NotificationService,
     private readonly consultationGateway: ConsultationGateway,
  ) {}

  /**
   * Called when a patient joins via the magic link.
   * Marks consultation as WAITING if it's still SCHEDULED,
   * and sends a reminder to the patient.
   */
  async joinAsPatient(consultationId: number, patientId: number) {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');

    const patient = await this.db.user.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new NotFoundException('Patient does not exist');

    await this.db.participant.upsert({
      where: { consultationId_userId: { consultationId, userId: patientId } },
      create: {
        consultationId,
        userId: patientId,
        isActive: true,
        joinedAt: new Date(),
      },
      update: { joinedAt: new Date(), isActive: true },
    });

    if (consultation.status === ConsultationStatus.SCHEDULED) {
      await this.db.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.WAITING },
      });

      if (consultation.messageService !== MessageService.MANUALLY) {
        this.logger.log(
          `Patient joined consultation ${consultationId}. Sending reminder...`,
        );
        await this.notificationService.sendReminder(consultationId);
      }
    }

    this.consultationGateway.emitPatientJoined(consultationId, patientId);

    return { success: true, consultationId };
  }

  /**
   * Called when the assigned practitioner joins the consultation.
   * Updates status to ACTIVE.
   */
  async joinAsPractitioner(consultationId: number, practitionerId: number) {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');

    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
    });
    if (!practitioner) throw new NotFoundException('Practitioner does not exist');

    if (consultation.owner !== practitionerId) {
      throw new ForbiddenException('Not the practitioner for this consultation');
    }

    await this.db.participant.upsert({
      where: {
        consultationId_userId: { consultationId, userId: practitionerId },
      },
      create: {
        consultationId,
        userId: practitionerId,
        isActive: true,
        joinedAt: new Date(),
      },
      update: { joinedAt: new Date(), isActive: true },
    });

    await this.db.consultation.update({
      where: { id: consultationId },
      data: { status: ConsultationStatus.ACTIVE },
    });

    this.logger.log(`Practitioner ${practitionerId} joined consultation ${consultationId}`);

    return { success: true, consultationId };
  }

  /**
   * Fetch consultations in WAITING status where:
   * - Practitioner is the owner
   * - Patient has already joined
   * - Practitioner has not yet joined
   */
  async getWaitingRoomConsultations(practitionerId: number) {
    const consultations = await this.db.consultation.findMany({
      where: {
        status: ConsultationStatus.WAITING,
        owner: practitionerId,
        participants: {
          some: {
            isActive: true,
            user: { role: 'Patient' },
          },
        },
        NOT: {
          participants: {
            some: {
              isActive: true,
              user: { role: 'Practitioner' },
            },
          },
        },
      },
      select: {
        id: true,
        scheduledDate: true,
        messageService: true,
        participants: {
          where: {
            isActive: true,
            user: { role: 'Patient' },
          },
          select: {
            joinedAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                country: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    this.logger.log(
      `Fetched ${consultations.length} waiting consultations for practitioner ${practitionerId}`,
    );

    return consultations;
  }
}
