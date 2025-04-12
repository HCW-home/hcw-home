import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationStatus } from '@prisma/client';

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);

  constructor(private readonly db: DatabaseService) {}

  // ✅ New Method: Create Consultation
  async createConsultation(data: any) {
    if (data.scheduledDate) {
      data.status = ConsultationStatus.SCHEDULED;
    }

    const consultation = await this.db.consultation.create({ data });

    // ✅ Log reminder scheduling if scheduledDate is present
    if (consultation.scheduledDate) {
      const scheduledDate = new Date(consultation.scheduledDate);
      const reminderTime = new Date(scheduledDate.getTime() - 60 * 60 * 1000); // 1 hour before

      this.logger.log(
        `🔔 Scheduled reminder job for consultation ID ${consultation.id} at ${reminderTime.toISOString()}`
      );
    }

    return consultation;
  }

  // ✅ Reminder Logic
  async sendUpcomingConsultationReminders() {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const consultations = await this.db.consultation.findMany({
      where: {
        scheduledDate: {
          gte: now,
          lte: tomorrow,
        },
        status: ConsultationStatus.SCHEDULED,
      },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
      },
    });

    for (const consultation of consultations) {
      for (const participant of consultation.participants) {
        this.logger.log(`📢 Reminder sent to: ${participant.user.phoneNumber}`);
        // Later: Integrate real Email/SMS/WhatsApp notification logic here
      }
    }
  }

  // ✅ Cron Job: Runs every minute (temp for testing)
  @Cron('* * * * *')
  handleReminderCron() {
    this.logger.log('⏰ Running scheduled consultation reminders...');
    this.sendUpcomingConsultationReminders();
  }

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
      where: {
        consultationId_userId: { consultationId, userId: patientId },
      },
      create: {
        consultationId,
        userId: patientId,
        isActive: true,
        joinedAt: new Date(),
      },
      update: { joinedAt: new Date() },
    });

    if (consultation.status === ConsultationStatus.SCHEDULED) {
      await this.db.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.WAITING },
      });
    }

    return { success: true, consultationId };
  }

  async joinAsPractitioner(consultationId: number, practitionerId: number) {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');

    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
    });
    if (!practitioner)
      throw new NotFoundException('Practitioner does not exist');

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
      update: { joinedAt: new Date() },
    });

    await this.db.consultation.update({
      where: { id: consultationId },
      data: { status: ConsultationStatus.ACTIVE },
    });

    return { success: true, consultationId };
  }

  async getWaitingRoomConsultations(practitionerId: number) {
    return this.db.consultation.findMany({
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
        participants: {
          where: {
            isActive: true,
            user: { role: 'Patient' },
          },
          select: {
            joinedAt: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                country: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });
  }
}
