import { Injectable, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { ConfigService } from 'src/config/config.service';
import { UserRole } from '@prisma/client';
import { HttpExceptionHelper } from '../helpers/execption/http-exception.helper';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private senderEmail: string;
  private isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.emailSendgridApiKey;
    this.senderEmail = this.configService.emailSenderAddress;

    // Check if email is properly configured
    const hasValidApiKey = apiKey && apiKey !== 'YOUR_SENDGRID_API_KEY_HERE';
    const hasValidSenderEmail = this.senderEmail && this.senderEmail !== 'no-reply@yourdomain.com';

    if (!hasValidApiKey || !hasValidSenderEmail) {
      this.logger.warn('⚠️  EmailService starting in DISABLED mode');
      this.logger.warn('Email functionality will not work until proper configuration is provided:');

      if (!hasValidApiKey) {
        this.logger.warn('- Set EMAIL_SENDGRID_API_KEY to a valid SendGrid API key');
      }
      if (!hasValidSenderEmail) {
        this.logger.warn('- Set EMAIL_SENDER_ADDRESS to a valid email address');
      }

      this.logger.warn('Application will continue to run, but email features will be mocked');
      this.isConfigured = false;
      return;
    }

    try {
      sgMail.setApiKey(apiKey);
      this.isConfigured = true;
      this.logger.log('✅ SendGrid EmailService configured successfully');
    } catch (error) {
      this.logger.error('Failed to configure SendGrid API key:', error);
      this.logger.warn('EmailService starting in DISABLED mode due to configuration error');
      this.isConfigured = false;
    }
  }

  private async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn(`Email service not configured - Mocking email to ${to} - ${subject}`);
      return;
    }

    const msg = {
      to,
      from: this.senderEmail,
      subject,
      html: htmlContent,
    };
    const maxAttempts = 3;
    let attempt = 0;
    let lastError: any = null;

    while (attempt < maxAttempts) {
      try {
        attempt += 1;
        await sgMail.send(msg);
        this.logger.log(`Email sent to ${to} - ${subject} (attempt ${attempt})`);
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt} to send email to ${to} failed: ${error?.message || error}`);
        // exponential backoff before retrying
        const backoffMs = Math.pow(2, attempt) * 250;
        await new Promise((res) => setTimeout(res, backoffMs));
      }
    }

    this.logger.error(`All ${maxAttempts} attempts to send email to ${to} failed`, lastError);
    throw lastError;
  }

  async sendConsultationInvitationEmail(
    toEmail: string,
    inviterName: string,
    consultationId: number,
    magicLinkUrl: string,
    role: UserRole,
    inviteeName?: string,
    notes?: string,
    scheduledTimeIST?: string,
    deviceTestCutoffIST?: string
  ) {
    try {
      this.logger.log(`[EmailService] 📧 Starting to send consultation invitation email to: ${toEmail}`);
      this.logger.log(`[EmailService] Email service configured: ${this.isConfigured}`);
      this.logger.log(`[EmailService] Sender email: ${this.senderEmail}`);

      if (!toEmail?.trim() || !magicLinkUrl?.trim()) {
        throw new Error('Email address and magic link URL are required');
      }

      const roleDisplay = this.getRoleDisplayName(role);

      const subject = `Consultation Invitation: Join as ${roleDisplay}`;
      const urlDomain = new URL(magicLinkUrl).hostname;
      const securityNotice =
        role === UserRole.PATIENT
          ? 'This link is personal and expires in 24 hours for your privacy.'
          : 'This invitation link is secure and expires in 24 hours.';

      const html = `
        <html>
        <body style="font-family: Arial, sans-serif; background: #f4f6fb; margin:0;">
          <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #e5e7eb;overflow:hidden;">
            <div style="background:#2563eb;color:#fff;padding:32px;text-align:center;">
              <h1 style="margin-bottom:8px;">You're Invited!</h1>
              <p style="color:#dbeafe;">Healthcare Consultation Invitation</p>
            </div>
            <div style="padding:32px;">
              <p style="font-size:18px;color:#1e293b;margin-bottom:16px;">Hello${inviteeName ? ` ${inviteeName}` : ''},</p>
              <p><strong>${inviterName}</strong> has invited you to join a healthcare consultation as <strong>${roleDisplay}</strong>.</p>
              <div style="background:#f1f5f9;padding:16px;border-radius:6px;margin:24px 0;">
                <p><strong>Consultation ID:</strong> #${consultationId}</p>
                <p><strong>Role:</strong> ${roleDisplay}</p>
                <p><strong>Invited by:</strong> ${inviterName}</p>
                ${scheduledTimeIST ? `<p><strong>Scheduled Time (IST):</strong> ${scheduledTimeIST}</p>` : ''}
                ${deviceTestCutoffIST ? `<p><strong>Device Testing Until (IST):</strong> ${deviceTestCutoffIST}</p>` : ''}
                <p><strong>Platform:</strong> ${urlDomain}</p>
              </div>
              ${notes ? `<div style="background:#fff7ed;border:1px solid #fdba74;padding:12px;border-radius:6px;margin-bottom:20px;"><strong>Note from ${inviterName}:</strong> ${notes}</div>` : ''}
              <div style="text-align:center;margin:32px 0;">
                <a href="${magicLinkUrl}" style="background:#f59e0b;color:#fff;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Acknowledge & Test Devices</a>
              </div>
              ${scheduledTimeIST && deviceTestCutoffIST ? `<div style="background:#fef3c7;padding:16px;border-radius:6px;margin-bottom:20px;"><strong>Important:</strong> Device testing closes at ${deviceTestCutoffIST}. Consultation starts at ${scheduledTimeIST}. You'll get a join link 2 minutes before your appointment.</div>` : ''}
              <div style="background:#ecfdf5;padding:12px;border-radius:6px;margin-bottom:20px;color:#065f46;font-size:14px;"><strong>Security Notice:</strong> ${securityNotice}</div>
              <div style="font-size:14px;color:#64748b;">
                <strong>What to expect:</strong>
                <ul style="margin-left:20px;">
                  ${role === UserRole.PATIENT ? `<li>Secure waiting room access</li><li>Practitioner will admit you</li><li>Chat, voice, and video available</li>` : `<li>Direct consultation room access</li><li>Chat, voice, and video available</li><li>Contribute as ${roleDisplay.toLowerCase()}</li>`}
                </ul>
                <strong>Technical requirements:</strong>
                <ul style="margin-left:20px;">
                  <li>Modern browser (Chrome, Firefox, Safari, Edge)</li>
                  <li>Stable internet connection</li>
                  <li>Camera/microphone (optional)</li>
                </ul>
              </div>
            </div>
            <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
              This is an automated message. If you received this in error, please ignore.<br>© ${new Date().getFullYear()} Healthcare Platform.
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(toEmail, subject, html);

      this.logger.log(
        `Consultation invitation email sent successfully - To: ${toEmail}, Role: ${role}, Consultation: ${consultationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send consultation invitation email to ${toEmail}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }

  async sendConsultationAssignedEmail(
    toEmail: string,
    patientName: string,
    practitionerName: string,
    consultationId: number,
    schedulingLink: string,
  ) {
    try {
      if (!toEmail?.trim() || !schedulingLink?.trim()) {
        throw new Error('Email address and scheduling link are required');
      }

      const subject = `Provider Assigned: Schedule Your Consultation`;
      const html = `
        <html>
        <body style="font-family: Arial, sans-serif; background: #f4f6fb; margin:0;">
          <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #e5e7eb;overflow:hidden;">
            <div style="background:#7c3aed;color:#fff;padding:32px;text-align:center;">
              <h1 style="margin-bottom:8px;">Provider Assigned</h1>
              <p style="color:#ede9fe;">Your consultation is ready to be scheduled</p>
            </div>
            <div style="padding:32px;">
              <p style="font-size:18px;color:#1e293b;margin-bottom:16px;">Hello ${patientName},</p>
              <p>Your request has been assigned to <strong>${practitionerName}</strong>. Please schedule your appointment at your convenience.</p>
              <div style="background:#f3f4f6;padding:16px;border-radius:6px;margin:24px 0;">
                <p><strong>Consultation ID:</strong> #${consultationId}</p>
                <p><strong>Assigned Provider:</strong> ${practitionerName}</p>
              </div>
              <div style="text-align:center;margin:32px 0;">
                <a href="${schedulingLink}" style="background:#7c3aed;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Schedule Appointment</a>
              </div>
              <div style="font-size:14px;color:#64748b;">
                <strong>Next steps:</strong>
                <ul style="margin-left:20px;">
                  <li>Click above to choose your time slot</li>
                  <li>Receive confirmation after scheduling</li>
                  <li>Join at your scheduled time</li>
                </ul>
                <p>If you need help, reply to this email or contact support.</p>
              </div>
            </div>
            <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
              This is an automated message. If the button doesn't work, copy and paste this link:<br><a href="${schedulingLink}">${schedulingLink}</a><br>© ${new Date().getFullYear()} Healthcare Platform.
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(toEmail, subject, html);
      this.logger.log(`Consultation assigned email sent to ${toEmail} for consultation ${consultationId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send consultation assigned email to ${toEmail}:`,
        error.stack,
      );
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }
  async sendSelfInvitationEmail(toEmail: string, invitationLink: string) {
    try {
      if (!toEmail?.trim() || !invitationLink?.trim()) {
        throw new Error('Email address and invitation link are required');
      }

      const subject = `✨ You're Invited to Join Our Healthcare Platform`;

      const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Healthcare Invitation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .cta-button { display: inline-block; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; margin: 20px 0; font-weight: bold; }
          .cta-button:hover { opacity: 0.9; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>✨ Welcome!</h1>
          <p>Your personal invitation to access our healthcare services</p>
        </div>
        <div class="content">
          <p>Hello,</p>
          
          <p>We’re excited to invite you to our healthcare platform. Use the link below to create your account and start using our services.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationLink}" class="cta-button">🔗 Accept Invitation</a>
          </div>
          
          <p><strong>Next Steps:</strong></p>
          <ul>
            <li>Click the button above to accept your invitation</li>
            <li>Set up your account details</li>
            <li>Book consultations and manage appointments</li>
          </ul>
          
          <p>If you need assistance, please reach out to our support team.</p>
          
          <p>Warm regards,<br>
          Your Healthcare Team</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
          <p>If the button above doesn't work, copy and paste this link into your browser:<br>
          <a href="${invitationLink}">${invitationLink}</a></p>
        </div>
      </body>
      </html>
    `;

      await this.sendEmail(toEmail, subject, html);
      this.logger.log(`Self-invitation email sent to ${toEmail}`);
    } catch (error) {
      throw HttpExceptionHelper.internalServerError('Failed to send self-invitation email');
      this.logger.error(
        `Failed to send self-invitation email to ${toEmail}:`,
        error.stack,
      );
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }


  async sendConsultationReminderEmail(
    toEmail: string,
    patientName: string,
    scheduledTime: string,
    consultationLink: string
  ) {
    try {
      if (!toEmail?.trim() || !consultationLink?.trim()) {
        throw new Error('Email address and consultation link are required');
      }

      const subject = 'Reminder: Your Consultation Starts Soon';
      const html = `
        <html>
        <body style="font-family: Arial, sans-serif; background: #f4f6fb; margin:0;">
          <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #e5e7eb;overflow:hidden;">
            <div style="background:#059669;color:#fff;padding:32px;text-align:center;">
              <h1 style="margin-bottom:8px;">Consultation Reminder</h1>
              <p style="color:#bbf7d0;">Your appointment is about to begin</p>
            </div>
            <div style="padding:32px;">
              <p style="font-size:18px;color:#1e293b;margin-bottom:16px;">Hello <strong>${patientName}</strong>,</p>
              <p>Your consultation scheduled for <strong>${scheduledTime}</strong> will start in <span style="color:#dc2626;font-weight:600;">1 minute</span>.</p>
              <div style="background:#fef3c7;padding:16px;border-radius:6px;margin:24px 0;">
                <strong>Ready to join?</strong> Click below to enter the waiting room. The practitioner will admit you soon.
              </div>
              <div style="text-align:center;margin:32px 0;">
                <a href="${consultationLink}" style="background:#059669;color:#fff;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Join Consultation</a>
              </div>
              <div style="background:#f1f5f9;padding:12px;border-radius:6px;margin-bottom:20px;color:#1e293b;font-size:14px;">
                <strong>Before you join:</strong>
                <ul style="margin-left:20px;">
                  <li>Check camera and microphone</li>
                  <li>Find a quiet, well-lit space</li>
                  <li>Have medical records ready if needed</li>
                  <li>Test your internet connection</li>
                </ul>
              </div>
              <div style="font-size:14px;color:#64748b;text-align:center;margin-top:24px;">Need help? Contact support or refresh your browser.</div>
            </div>
            <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
              © ${new Date().getFullYear()} Healthcare Platform.
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(toEmail, subject, html);
      this.logger.log(`Consultation reminder email sent to ${toEmail}`);
    } catch (error) {
      this.logger.error(
        `Failed to send consultation reminder email to ${toEmail}:`,
        error.stack,
      );
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }

  async sendPreConsultationEmail(
    toEmail: string,
    patientName: string,
    practitionerName: string,
    consultationId: number,
    consultationRoomUrl: string,
    scheduledDate: Date,
  ) {
    try {
      if (!toEmail?.trim() || !consultationRoomUrl?.trim()) {
        throw new Error('Email address and consultation room URL are required');
      }

      const subject = `Consultation Starting: Join Now`;
      const formattedDate = scheduledDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      const html = `
        <html>
        <body style="font-family: Arial, sans-serif; background: #f4f6fb; margin:0;">
          <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #e5e7eb;overflow:hidden;">
            <div style="background:#047857;color:#fff;padding:32px;text-align:center;">
              <h1 style="margin-bottom:8px;">Consultation Starting Now</h1>
              <p style="color:#a7f3d0;">Your healthcare appointment is ready</p>
            </div>
            <div style="padding:32px;">
              <p style="font-size:18px;color:#1e293b;margin-bottom:16px;">Hello ${patientName},</p>
              <p>Your scheduled consultation with <strong>${practitionerName}</strong> is starting now. Please join using the secure link below.</p>
              <div style="background:#f0fdf4;padding:16px;border-radius:6px;margin:24px 0;">
                <p><strong>Consultation ID:</strong> #${consultationId}</p>
                <p><strong>Practitioner:</strong> ${practitionerName}</p>
                <p><strong>Scheduled Time:</strong> ${formattedDate}</p>
                <p><strong>Status:</strong> <span style="color:#059669;font-weight:600;">Ready to Join</span></p>
              </div>
              <div style="text-align:center;margin:32px 0;">
                <a href="${consultationRoomUrl}" style="background:#047857;color:#fff;padding:18px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:18px;">Join Consultation Room</a>
              </div>
              <div style="background:#eff6ff;padding:12px;border-radius:6px;margin-bottom:20px;color:#1e40af;font-size:14px;">
                <strong>Reminder:</strong> You'll enter a waiting room first. The practitioner will admit you when ready.
              </div>
              <div style="font-size:14px;color:#64748b;">
                <strong>What happens next:</strong>
                <ul style="margin-left:20px;">
                  <li>Click "Join Consultation Room" above</li>
                  <li>You'll enter a secure waiting room</li>
                  <li>Practitioner will be notified of your arrival</li>
                  <li>Admitted to consultation when ready</li>
                </ul>
                <strong>Technical support:</strong>
                <ul style="margin-left:20px;">
                  <li>Stable internet connection</li>
                  <li>Allow camera/microphone permissions</li>
                  <li>If issues, refresh the page</li>
                </ul>
              </div>
            </div>
            <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
              This link is secure and personal. If you cannot attend, contact your provider.<br>© ${new Date().getFullYear()} Healthcare Platform.
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(toEmail, subject, html);

      this.logger.log(
        `Pre-consultation email sent successfully - To: ${toEmail}, Consultation: ${consultationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send pre-consultation email to ${toEmail}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Pre-consultation email delivery failed: ${error.message}`);
    }
  }

  private getRoleDisplayName(role: UserRole): string {
    switch (role) {
      case UserRole.PATIENT:
        return 'Patient';
      case UserRole.EXPERT:
        return 'Expert';
      case UserRole.GUEST:
        return 'Guest';
      case UserRole.PRACTITIONER:
        return 'Practitioner';
      default:
        return role;
    }
  }

  /**
   * Send direct consultation room invitation to GUEST or EXPERT
   * This email contains a direct link to join the consultation room - no authentication required
   */
  async sendDirectRoomInvitationEmail(
    toEmail: string,
    inviterName: string,
    consultationId: number,
    directRoomLink: string,
    role: UserRole,
    inviteeName?: string,
    notes?: string,
    scheduledTimeIST?: string
  ) {
    try {
      this.logger.log(`[EmailService] 📧 Sending DIRECT ROOM invitation email to: ${toEmail}`);
      this.logger.log(`[EmailService] Role: ${role}, Consultation: ${consultationId}`);
      this.logger.log(`[EmailService] Email service configured: ${this.isConfigured}`);

      if (!toEmail?.trim() || !directRoomLink?.trim()) {
        throw new Error('Email address and direct room link are required');
      }

      if (role !== UserRole.GUEST && role !== UserRole.EXPERT) {
        throw new Error('Direct room invitations are only for GUEST and EXPERT roles');
      }

      const roleDisplay = this.getRoleDisplayName(role);

      const subject = `🎯 Direct Access: Join Consultation as ${roleDisplay}`;
      const urlDomain = new URL(directRoomLink).hostname;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Consultation Invitation</title>
        </head>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; margin:0; padding:0;">
          <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);overflow:hidden;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);color:#fff;padding:40px 32px;text-align:center;">
              <h1 style="margin:0 0 12px 0;font-size:28px;font-weight:700;">🎯 You're Invited!</h1>
              <p style="margin:0;font-size:16px;color:#d1fae5;font-weight:500;">Direct Access to Healthcare Consultation</p>
            </div>
            
            <!-- Main Content -->
            <div style="padding:40px 32px;">
              <p style="font-size:18px;color:#1e293b;margin:0 0 16px 0;font-weight:600;">Hello${inviteeName ? ` ${inviteeName}` : ''}! 👋</p>
              
              <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px 0;">
                <strong style="color:#10b981;">${inviterName}</strong> has invited you to join a healthcare consultation as <strong style="color:#10b981;">${roleDisplay}</strong>.
              </p>
              
              <!-- Consultation Details Box -->
              <div style="background:#f0fdf4;border:2px solid #86efac;padding:20px;border-radius:10px;margin:0 0 28px 0;">
                <h3 style="margin:0 0 12px 0;font-size:16px;color:#166534;font-weight:600;">📋 Consultation Details</h3>
                <table style="width:100%;font-size:14px;color:#166534;">
                  <tr>
                    <td style="padding:6px 0;"><strong>Consultation ID:</strong></td>
                    <td style="padding:6px 0;text-align:right;">#${consultationId}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;"><strong>Your Role:</strong></td>
                    <td style="padding:6px 0;text-align:right;">${roleDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;"><strong>Invited by:</strong></td>
                    <td style="padding:6px 0;text-align:right;">${inviterName}</td>
                  </tr>
                  ${scheduledTimeIST ? `
                  <tr>
                    <td style="padding:6px 0;"><strong>Scheduled Time:</strong></td>
                    <td style="padding:6px 0;text-align:right;">${scheduledTimeIST} (IST)</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding:6px 0;"><strong>Platform:</strong></td>
                    <td style="padding:6px 0;text-align:right;">${urlDomain}</td>
                  </tr>
                </table>
              </div>
              
              ${notes ? `
              <!-- Personal Note -->
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:6px;margin:0 0 28px 0;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">📝 Personal Message</p>
                <p style="margin:0;font-size:14px;color:#78350f;line-height:1.6;">${notes}</p>
              </div>
              ` : ''}
              
              <!-- Call to Action Button -->
              <div style="text-align:center;margin:0 0 32px 0;">
                <a href="${directRoomLink}" style="display:inline-block;background:linear-gradient(135deg, #10b981 0%, #059669 100%);color:#ffffff;padding:18px 48px;border-radius:10px;text-decoration:none;font-weight:700;font-size:17px;box-shadow:0 4px 12px rgba(16,185,129,0.3);transition:all 0.3s ease;">
                  🚀 Join Consultation Now
                </a>
              </div>
              
              <!-- Direct Access Notice -->
              <div style="background:#e0f2fe;border:2px solid #38bdf8;padding:18px 20px;border-radius:10px;margin:0 0 28px 0;">
                <div style="display:flex;align-items:flex-start;">
                  <span style="font-size:24px;margin-right:12px;">⚡</span>
                  <div>
                    <h4 style="margin:0 0 8px 0;font-size:15px;color:#0369a1;font-weight:700;">Direct Access - No Sign-up Required!</h4>
                    <p style="margin:0;font-size:14px;color:#0c4a6e;line-height:1.5;">
                      Simply click the button above to join instantly. No account creation or authentication needed. 
                      ${scheduledTimeIST ? `You can join anytime, but the consultation is scheduled for <strong>${scheduledTimeIST} (IST)</strong>.` : 'You can join anytime the consultation is active.'}
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- What to Expect Section -->
              <div style="margin:0 0 28px 0;">
                <h3 style="margin:0 0 16px 0;font-size:16px;color:#1e293b;font-weight:600;">✨ What to Expect</h3>
                <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#475569;line-height:1.8;">
                  <li style="margin-bottom:8px;">🎥 <strong>Instant access</strong> to the consultation room</li>
                  <li style="margin-bottom:8px;">💬 <strong>Real-time chat</strong> with all participants</li>
                  <li style="margin-bottom:8px;">🎤 <strong>Audio & video</strong> communication (optional)</li>
                  <li style="margin-bottom:8px;">🤝 <strong>Collaborate</strong> as ${roleDisplay.toLowerCase()}</li>
                  <li style="margin-bottom:8px;">🔐 <strong>Secure & private</strong> consultation environment</li>
                </ul>
              </div>
              
              <!-- Technical Requirements -->
              <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:18px 20px;border-radius:8px;margin:0 0 20px 0;">
                <h4 style="margin:0 0 12px 0;font-size:14px;color:#334155;font-weight:600;">💻 Technical Requirements</h4>
                <ul style="margin:0;padding:0 0 0 20px;font-size:13px;color:#64748b;line-height:1.7;">
                  <li>Modern browser (Chrome, Firefox, Safari, or Edge)</li>
                  <li>Stable internet connection (recommended: 5+ Mbps)</li>
                  <li>Camera & microphone (optional, but recommended)</li>
                  <li>Desktop or tablet for best experience</li>
                </ul>
              </div>
              
              <!-- Security Notice -->
              <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:14px 18px;border-radius:6px;margin:0 0 20px 0;">
                <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.6;">
                  🔒 <strong>Privacy & Security:</strong> This link is personal to you and expires in 24 hours. 
                  Do not share this link with others. All communication is encrypted and HIPAA-compliant.
                </p>
              </div>
              
              <!-- Alternative Link -->
              <div style="padding:16px 0;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 8px 0;font-size:12px;color:#94a3b8;text-align:center;">
                  If the button doesn't work, copy and paste this link:
                </p>
                <p style="margin:0;font-size:12px;color:#64748b;text-align:center;word-break:break-all;">
                  <a href="${directRoomLink}" style="color:#10b981;text-decoration:underline;">${directRoomLink}</a>
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background:#f1f5f9;padding:24px 32px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#475569;font-weight:500;">Need help? Contact our support team</p>
              <p style="margin:0 0 16px 0;font-size:12px;color:#94a3b8;">
                This is an automated message. If you received this in error, please ignore.
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">
                © ${new Date().getFullYear()} Healthcare Platform. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(toEmail, subject, html);

      this.logger.log(
        `✅ Direct room invitation email sent successfully - To: ${toEmail}, Role: ${role}, Consultation: ${consultationId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to send direct room invitation email to ${toEmail}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }
}
