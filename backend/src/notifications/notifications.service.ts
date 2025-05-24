import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../src/database/database.service';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { MessageService, ConsultationStatus } from '@prisma/client';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsappService,
  ) {}

  // Helper to pick SMS/WhatsApp provider by patient phone prefix
  private async findProviderByPhone(phoneNumber: string) {
    const normalizedPhone = phoneNumber.replace(/[\s\-+]/g, '');

    // Find providers where prefix matches the start of phoneNumber and provider is enabled
    const providers = await this.db.sMS_Providers.findMany({
      where: {
        isDisabled: false,
        prefix: {
          not: undefined,
        },
      },
      orderBy: { order: 'asc' },
    });

    // Match longest prefix first (e.g. +91 before +9)
    for (const provider of providers) {
      if (normalizedPhone.startsWith(provider.prefix)) {
        return provider;
      }
    }

    return null;
  }

  async sendReminder(consultationId: number): Promise<void> {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
        whatsappTemplate: true,
      },
    });

    if (!consultation) {
      this.logger.warn(`Consultation ${consultationId} not found.`);
      return;
    }

    if (consultation.status !== ConsultationStatus.SCHEDULED) {
      this.logger.warn(`Consultation ${consultationId} is not scheduled.`);
      return;
    }

    const patient = consultation.participants.find(
      (p) => p.user.role === 'Patient',
    )?.user;

    if (!patient) {
      this.logger.warn(`No patient found in consultation ${consultationId}`);
      return;
    }

    switch (consultation.messageService) {
      case MessageService.EMAIL:
        if (!patient.email) {
          this.logger.warn(`Patient ${patient.id} has no email.`);
          return;
        }

        await this.emailService.sendEmail(
          patient.email,
          'Consultation Reminder',
          `
            Dear ${patient.firstName},
            <br><br>
            This is a reminder for your consultation scheduled on <strong>${consultation.scheduledDate?.toLocaleString()}</strong>.
            <br><br>
            Thank you,
            <br>
            Healthcare Team
          `,
        );

        this.logger.log(
          `Email reminder sent to ${patient.email} for consultation ${consultationId}`,
        );
        break;

      case MessageService.WHATSAPP:
      case MessageService.SMS:
        if (!patient.phoneNumber) {
          this.logger.warn(`Patient ${patient.id} has no phone number.`);
          return;
        }

        const provider = await this.findProviderByPhone(patient.phoneNumber);

        if (!provider) {
          this.logger.warn(
            `No SMS/WhatsApp provider found for phone ${patient.phoneNumber}`,
          );
          return;
        }

        if (consultation.messageService === MessageService.WHATSAPP) {
          if (!consultation.whatsappTemplate) {
            this.logger.warn(
              `No WhatsApp template configured for consultation ${consultationId}`,
            );
            return;
          }

          await this.whatsappService.sendTemplateMessage({
            to: patient.phoneNumber,
            template: consultation.whatsappTemplate,
            variables: {
              name: patient.firstName,
              date: consultation.scheduledDate
                ? consultation.scheduledDate.toLocaleString()
                : '',
            },
          });

          this.logger.log(
            `WhatsApp reminder sent to ${patient.phoneNumber} using provider ${provider.provider} for consultation ${consultationId}`,
          );
        } else {
          // TODO: Implement SMS sending logic here using the provider
          this.logger.log(
            `SMS reminder would be sent to ${patient.phoneNumber} using provider ${provider.provider} for consultation ${consultationId}`,
          );
        }
        break;

      case MessageService.MANUALLY:
        this.logger.log(
          `Manual reminder configured - skipping automatic send for consultation ${consultationId}`,
        );
        break;

      default:
        this.logger.warn(
          `Unsupported message service: ${consultation.messageService}`,
        );
    }
  }
}
