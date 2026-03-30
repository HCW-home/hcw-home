import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '../../config/config.service';
import { InvitationStatus } from '@prisma/client';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private readonly TIMEZONE = 'Asia/Kolkata'; // Indian Standard Time (IST)

  constructor(
    private readonly prisma: DatabaseService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService
  ) { }

  /**
   * Format time for logging (IST)
   */
  private formatTimeIST(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: this.TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkUpcomingConsultations() {
    try {
      const now = new Date();
      const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);
      const threeMinutesFromNow = new Date(now.getTime() + 3 * 60 * 1000);

      this.logger.log(`[CRON] ReminderService.checkUpcomingConsultations triggered at ${this.formatTimeIST(now)} (IST)`);
      this.logger.log(`[CRON] Searching for consultations scheduled between ${this.formatTimeIST(twoMinutesFromNow)} and ${this.formatTimeIST(threeMinutesFromNow)} (IST)`);

      const upcomingConsultations = await this.prisma.consultation.findMany({
        where: {
          scheduledDate: {
            gte: twoMinutesFromNow,
            lte: threeMinutesFromNow
          },
          status: 'SCHEDULED'
        },
        include: {
          ConsultationInvitation: {
            where: {
              OR: [
                { status: InvitationStatus.USED },
                { status: InvitationStatus.PENDING }
              ]
            }
          }
        }
      });

      this.logger.log(`[CRON] Found ${upcomingConsultations.length} consultations to process for reminders.`);

      for (const consultation of upcomingConsultations) {
        const scheduledDateStr = consultation.scheduledDate ? this.formatTimeIST(consultation.scheduledDate) : 'Not scheduled';
        this.logger.log(`[CRON] Processing consultation ID: ${consultation.id}, scheduled for ${scheduledDateStr} (IST)`);
        for (const invitation of consultation.ConsultationInvitation) {
          this.logger.log(`[CRON] Sending reminder for invitation ID: ${invitation.id}, email: ${invitation.inviteEmail}, status: ${invitation.status}`);
          await this.sendConsultationLink(invitation, consultation);
        }
      }

      if (upcomingConsultations.length > 0) {
        this.logger.log(`[CRON] Processed ${upcomingConsultations.length} upcoming consultations for 2-minute reminders.`);
      } else {
        this.logger.log(`[CRON] No consultations found for 2-minute reminders at this time.`);
      }

    } catch (error) {
      this.logger.error('[CRON] Error checking upcoming consultations:', error);
    }
  }

  private async sendConsultationLink(invitation: any, consultation: any) {
    try {
      const patientBaseUrl = this.configService.patientUrl || 'https://app.hcw-at-home.com';
      const consultationLink = `${patientBaseUrl}/inv/?invite=${invitation.token}`;

      // Format scheduled time in IST
      const scheduledTimeIST = consultation.scheduledDate ?
        this.formatTimeIST(new Date(consultation.scheduledDate)) :
        'Not scheduled';

      this.logger.log(`[sendConsultationLink] Sending reminder for consultation ${consultation.id}:`, {
        email: invitation.inviteEmail,
        scheduledTimeIST,
        link: consultationLink
      });

      // Send the consultation reminder email with join link
      await this.emailService.sendConsultationReminderEmail(
        invitation.inviteEmail,
        invitation.name || 'Patient',
        scheduledTimeIST,
        consultationLink
      );

      // IMPORTANT: Auto-accept the invitation when sending 2-minute reminder
      if (invitation.status === InvitationStatus.PENDING) {
        await this.prisma.consultationInvitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.USED,
            usedAt: new Date()
          }
        });
        this.logger.log(`Auto-accepted invitation ${invitation.id} when sending 2-minute reminder`);
      }

      this.logger.log(`Consultation reminder sent to ${invitation.inviteEmail} for consultation ${consultation.id}`);

    } catch (error) {
      this.logger.error(`Failed to send consultation link to ${invitation.inviteEmail}:`, error);
    }
  }
}
