import { Injectable, Logger } from '@nestjs/common';
import { HttpExceptionHelper } from '../../common/helpers/execption/http-exception.helper';
import { DatabaseService } from '../../database/database.service';
import { InvitationStatus, UserRole } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { ConfigService } from '../../config/config.service';
import { v4 as uuidv4 } from 'uuid';
import { addMinutes, isAfter } from 'date-fns';

const ALLOWED_INVITE_ROLES: UserRole[] = [
  UserRole.PATIENT,
  UserRole.EXPERT,
  UserRole.GUEST,
];

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  // Development: Use IST timezone for easier testing
  private readonly TIMEZONE = 'Asia/Kolkata'; // Indian Standard Time (IST)

  constructor(
    private prisma: DatabaseService,
    private emailService: EmailService,
    private configService: ConfigService
  ) { }

  /**
   * Get current time in IST for development
   * This ensures all time comparisons use the same timezone
   */
  private getCurrentTimeIST(): Date {
    // Get current UTC time
    const now = new Date();

    // For development: Just use current system time
    // The database stores in UTC, Node.js Date objects work in UTC internally
    // We'll log in IST format but compare raw timestamps

    this.logger.debug(`[TIME] Current time: ${this.formatTimeIST(now)}`);

    return now;
  }

  /**
   * Convert a date to IST for comparison (not needed, just for display)
   */
  private toIST(date: Date): Date {
    return date; // Return as-is, Date objects are timezone-agnostic
  }

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

  async getInvitesByPractitioner(practitionerId: number, page: number = 1, limit: number = 10) {
    this.logger.log(`Fetching invites for practitioner ${practitionerId}, page ${page}, limit ${limit}`);
    const skip = (page - 1) * limit;

    // First, let's check all invitations in the database for debugging
    const allInvitations = await this.prisma.consultationInvitation.findMany({
      select: {
        id: true,
        createdById: true,
        inviteEmail: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    this.logger.debug(`All recent invitations in database: ${JSON.stringify(allInvitations)}`);
    this.logger.log(`Looking for invitations with createdById = ${practitionerId}`);

    const [invites, total] = await Promise.all([
      this.prisma.consultationInvitation.findMany({
        where: {
          createdById: practitionerId
        },
        include: {
          consultation: {
            include: {
              participants: {
                include: {
                  user: true
                }
              }
            }
          },
          invitedUser: true,
          createdBy: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      this.prisma.consultationInvitation.count({
        where: {
          createdById: practitionerId
        }
      })
    ]);

    this.logger.log(`Found ${invites.length} invites out of ${total} total`);

    const formattedInvites = invites.map(invite => {
      // Determine acceptance status based on invitation status
      let acceptanceStatus = 'Scheduled'; // Default status when invitation is created
      let statusTag = 'scheduled';

      if (invite.status === 'USED') {
        acceptanceStatus = 'Accepted';
        statusTag = 'accepted';
      } else if (invite.status === 'REVOKED') {
        acceptanceStatus = 'Rejected';
        statusTag = 'rejected';
      } else if (invite.expiresAt < new Date()) {
        acceptanceStatus = 'Expired';
        statusTag = 'expired';
      } else if (invite.status === 'PENDING') {
        acceptanceStatus = 'Scheduled';
        statusTag = 'scheduled';
      }

      return {
        id: invite.id,
        patientName: invite.name || (invite.invitedUser ? `${invite.invitedUser.firstName} ${invite.invitedUser.lastName}` : 'Unknown'),
        patientEmail: invite.inviteEmail,
        status: invite.status.toLowerCase(),
        acceptanceStatus: acceptanceStatus,
        statusTag: statusTag, // For frontend display
        createdAt: invite.createdAt,
        consultationId: invite.consultationId,
        scheduledDate: invite.consultation?.scheduledDate,
        practitionerId: invite.createdById,
        expiresAt: invite.expiresAt,
        notes: invite.notes,
        role: invite.role,
        communicationMethod: 'Email', // Currently only email is supported
        token: invite.token // Include token for frontend operations
      };
    });

    const totalPages = Math.ceil(total / limit);

    const response = {
      success: true,
      data: {
        invites: formattedInvites,
        total,
        currentPage: page,
        totalPages
      }
    };

    this.logger.log(`Returning response with ${formattedInvites.length} formatted invites`);
    return response;
  }

  async acceptInvite(inviteId: string, userId: number) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { id: inviteId },
      include: { consultation: true }
    });

    if (!invite) {
      throw HttpExceptionHelper.notFound('Invitation not found');
    }

    if (invite.invitedUserId !== userId) {
      throw HttpExceptionHelper.badRequest('You are not authorized to accept this invitation');
    }

    if (invite.status !== InvitationStatus.PENDING) {
      throw HttpExceptionHelper.badRequest('Invitation is no longer pending');
    }

    if (invite.expiresAt < new Date()) {
      throw HttpExceptionHelper.badRequest('Invitation has expired');
    }

    await this.prisma.consultationInvitation.update({
      where: { id: inviteId },
      data: {
        status: InvitationStatus.USED,
        usedAt: new Date()
      }
    });

    return {
      success: true,
      message: 'Invitation accepted successfully'
    };
  }

  async rejectInvite(inviteId: string, userId: number) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { id: inviteId }
    });

    if (!invite) {
      throw HttpExceptionHelper.notFound('Invitation not found');
    }

    if (invite.invitedUserId !== userId) {
      throw HttpExceptionHelper.badRequest('You are not authorized to reject this invitation');
    }

    if (invite.status !== InvitationStatus.PENDING) {
      throw HttpExceptionHelper.badRequest('Invitation is no longer pending');
    }

    await this.prisma.consultationInvitation.update({
      where: { id: inviteId },
      data: {
        status: InvitationStatus.REVOKED,
        usedAt: new Date()
      }
    });

    return {
      success: true,
      message: 'Invitation rejected'
    };
  }

  async createInvite(inviteData: any) {
    this.logger.log('Creating invite with data', {
      email: inviteData.email,
      name: inviteData.name,
      consultationId: inviteData.consultationId,
      role: inviteData.role,
      manualSend: inviteData.manualSend
    });

    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Create the invitation in the database
    const invite = await this.prisma.consultationInvitation.create({
      data: {
        consultationId: inviteData.consultationId,
        inviteEmail: inviteData.email,
        name: inviteData.name,
        notes: inviteData.notes,
        role: inviteData.role || UserRole.PATIENT,
        token: token,
        expiresAt: expiresAt,
        createdById: inviteData.practitionerId,
        status: InvitationStatus.PENDING
      }
    });

    this.logger.log('Invite created in database', {
      id: invite.id,
      token: invite.token,
      email: invite.inviteEmail
    });

    // Get consultation details for email content
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: inviteData.consultationId },
      include: {
        owner: true
      }
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    // Send invitation email if not manual send
    this.logger.log(`manualSend flag: ${inviteData.manualSend}`);
    if (!inviteData.manualSend) {
      this.logger.log('Triggering email send...');
      await this.sendInvitationEmail(invite, consultation, inviteData.timezone || 'Asia/Kolkata');
    } else {
      this.logger.log('Skipping email send (manual send flag is true)');
    }

    return {
      success: true,
      message: 'Invitation created successfully',
      data: {
        ...invite,
        emailSent: !inviteData.manualSend
      }
    };
  }

  private async sendInvitationEmail(invite: any, consultation: any, timezone: string) {
    try {
      const patientBaseUrl = this.configService.patientUrl || 'https://app.hcw-at-home.com';
      const acknowledgeLink = `${patientBaseUrl}/acknowledge-invite/${invite.token}`;

      const practitionerName = consultation.owner ?
        `${consultation.owner.firstName} ${consultation.owner.lastName}` :
        'HCW@Home practitioner';

      // Format scheduled date in IST if available
      let scheduledTimeIST: string | undefined = undefined;
      let deviceTestCutoffIST: string | undefined = undefined;

      if (consultation.scheduledDate) {
        const consultationTime = new Date(consultation.scheduledDate);
        const twoMinutesBefore = new Date(consultationTime.getTime() - 2 * 60 * 1000);

        scheduledTimeIST = this.formatTimeIST(consultationTime);
        deviceTestCutoffIST = this.formatTimeIST(twoMinutesBefore);

        this.logger.log(`[sendInvitationEmail] IST Times:`, {
          consultation: scheduledTimeIST,
          deviceTestCutoff: deviceTestCutoffIST
        });
      }

      this.logger.log('Preparing to send invitation email', {
        to: invite.inviteEmail,
        practitionerName,
        consultationId: consultation.id,
        acknowledgeLink,
        role: invite.role,
        inviteeName: invite.name,
        scheduledTimeIST,
        deviceTestCutoffIST
      });

      await this.emailService.sendConsultationInvitationEmail(
        invite.inviteEmail,
        practitionerName,
        consultation.id,
        acknowledgeLink,
        invite.role,
        invite.name,
        invite.notes,
        scheduledTimeIST,
        deviceTestCutoffIST
      );

      this.logger.log(`Invitation email sent successfully to: ${invite.inviteEmail}`);

    } catch (error) {
      this.logger.error('Failed to send invitation email', {
        message: error?.message,
        stack: error?.stack,
        email: invite.inviteEmail
      });
      // Don't throw error here, just log it so the invitation is still created
    }
  }

  async acknowledgeInvite(token: string) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { token },
      include: {
        consultation: true,
        createdBy: true
      }
    });

    if (!invite) {
      throw HttpExceptionHelper.notFound('Invitation not found');
    }

    // Debug info
    const debugInfo = {
      nowIST: this.formatTimeIST(this.getCurrentTimeIST()),
      scheduledDate: invite.consultation?.scheduledDate,
      inviteStatus: invite.status,
      usedAt: invite.usedAt,
      expiresAt: invite.expiresAt
    };

    // Check if invitation has already been fully accepted (device testing completed)
    if (invite.status === InvitationStatus.USED && invite.usedAt) {
      // If already accepted, check if consultation time hasn't passed
      if (invite.consultation?.scheduledDate) {
        const now = this.getCurrentTimeIST();
        const consultationTime = new Date(invite.consultation.scheduledDate);

        this.logger.log(`[acknowledgeInvite] Already accepted - Checking if still valid`);
        this.logger.log(`  Current time (IST): ${this.formatTimeIST(now)}`);
        this.logger.log(`  Consultation time: ${this.formatTimeIST(consultationTime)}`);

        if (now < consultationTime) {
          // Already acknowledged and accepted, return success with current status
          return {
            success: true,
            message: 'Invitation already acknowledged and accepted.',
            data: {
              consultation: invite.consultation,
              practitioner: invite.createdBy,
              token: invite.token,
              deviceTestRequired: false,
              alreadyCompleted: true
            }
          };
        }
      }
      throw HttpExceptionHelper.badRequest(`Invitation has already been processed. Debug: ${JSON.stringify(debugInfo)}`);
    }

    // Check if invitation has expired based on consultation time
    // Invitation remains valid until consultation starts (patients can acknowledge anytime before)
    if (invite.consultation?.scheduledDate) {
      const now = this.getCurrentTimeIST();
      const consultationTime = new Date(invite.consultation.scheduledDate);

      this.logger.log(`[acknowledgeInvite] Time validation check:`);
      this.logger.log(`  Current time (IST): ${this.formatTimeIST(now)}`);
      this.logger.log(`  Current time (ISO): ${now.toISOString()}`);
      this.logger.log(`  Consultation time (IST): ${this.formatTimeIST(consultationTime)}`);
      this.logger.log(`  Consultation time (ISO): ${consultationTime.toISOString()}`);

      const minutesUntil = Math.round((consultationTime.getTime() - now.getTime()) / 60000);
      this.logger.log(`  Time difference (ms): ${consultationTime.getTime() - now.getTime()}`);
      this.logger.log(`  Time until consultation: ${minutesUntil} minutes`);
      this.logger.log(`  Comparison: now (${now.getTime()}) >= consultation (${consultationTime.getTime()})? ${now >= consultationTime}`);

      if (now >= consultationTime) {
        this.logger.warn(`[acknowledgeInvite] ❌ Consultation time has passed`);
        throw HttpExceptionHelper.badRequest(`Consultation time has passed. Invitation is no longer valid. Debug: ${JSON.stringify(debugInfo)}`);
      }

      this.logger.log(`[acknowledgeInvite] ✅ Time check passed - Invitation is valid`);
      // Allow acknowledgment anytime before consultation starts
      // Device testing has a separate 2-minute cutoff in completeDeviceTestAndAcceptInvite
    } else {
      // If no consultation scheduled date, fall back to expiresAt
      if (invite.expiresAt < new Date()) {
        throw HttpExceptionHelper.badRequest(`Invitation has expired. Debug: ${JSON.stringify(debugInfo)}`);
      }
    }

    // If status is PENDING, this is first acknowledgment - don't update status yet
    // Status will be updated to USED only after successful device testing
    return {
      success: true,
      message: 'Invitation acknowledged successfully. Please complete device testing.',
      data: {
        consultation: invite.consultation,
        practitioner: invite.createdBy,
        token: invite.token,
        deviceTestRequired: true,
        alreadyCompleted: false
      }
    };
  }

  async completeDeviceTestAndAcceptInvite(token: string, deviceTestResults: {
    cameraTest: boolean;
    microphoneTest: boolean;
    speakerTest: boolean;
  }) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { token },
      include: {
        consultation: true,
        createdBy: true
      }
    });

    if (!invite) {
      throw HttpExceptionHelper.notFound('Invitation not found');
    }

    // Debug info
    const debugInfo = {
      nowIST: this.formatTimeIST(this.getCurrentTimeIST()),
      scheduledDate: invite.consultation?.scheduledDate,
      inviteStatus: invite.status,
      usedAt: invite.usedAt,
      expiresAt: invite.expiresAt
    };

    // Allow device testing if status is PENDING or USED (re-testing)
    if (invite.status !== InvitationStatus.PENDING && invite.status !== InvitationStatus.USED) {
      throw HttpExceptionHelper.badRequest(`Invitation cannot be processed. Debug: ${JSON.stringify(debugInfo)}`);
    }

    // Check if invitation has expired based on consultation time
    // Allow device testing until 2 minutes before consultation
    if (invite.consultation?.scheduledDate) {
      const now = this.getCurrentTimeIST();
      const consultationTime = new Date(invite.consultation.scheduledDate);
      const twoMinutesBeforeConsultation = new Date(consultationTime.getTime() - 2 * 60 * 1000);

      this.logger.log(`[completeDeviceTest] Time validation check (IST):`);
      this.logger.log(`  Current time (IST): ${this.formatTimeIST(now)}`);
      this.logger.log(`  Consultation time: ${this.formatTimeIST(consultationTime)}`);
      this.logger.log(`  Two minutes before: ${this.formatTimeIST(twoMinutesBeforeConsultation)}`);
      this.logger.log(`  Minutes until consultation: ${Math.round((consultationTime.getTime() - now.getTime()) / 60000)}`);
      this.logger.log(`  Can still test? ${now < twoMinutesBeforeConsultation ? '✅ YES' : '❌ NO'}`);

      if (now >= consultationTime) {
        this.logger.warn(`[completeDeviceTest] ❌ Consultation time has passed`);
        throw HttpExceptionHelper.badRequest(`Consultation time has passed. Invitation is no longer valid. Debug: ${JSON.stringify(debugInfo)}`);
      }

      if (now >= twoMinutesBeforeConsultation) {
        this.logger.warn(`[completeDeviceTest] ❌ Within 2-minute window - device testing not allowed`);
        throw HttpExceptionHelper.badRequest(`Device testing period has ended. Please wait for your consultation reminder email. Debug: ${JSON.stringify(debugInfo)}`);
      }

      this.logger.log(`[completeDeviceTest] ✅ Time check passed - can complete device testing`);
    } else {
      // If no consultation scheduled date, fall back to expiresAt
      if (invite.expiresAt < new Date()) {
        throw HttpExceptionHelper.badRequest(`Invitation has expired. Debug: ${JSON.stringify(debugInfo)}`);
      }
    }

    // All device tests must pass for acceptance
    if (!deviceTestResults.cameraTest || !deviceTestResults.microphoneTest || !deviceTestResults.speakerTest) {
      return {
        success: false,
        message: 'All device tests (camera, microphone, and speaker) must pass to accept the invitation',
        data: {
          deviceTestResults,
          requiresRetest: true,
          cameraTest: deviceTestResults.cameraTest,
          microphoneTest: deviceTestResults.microphoneTest,
          speakerTest: deviceTestResults.speakerTest
        }
      };
    }

    // Update invitation status to fully accepted
    await this.prisma.consultationInvitation.update({
      where: { token },
      data: {
        status: InvitationStatus.USED, // This represents fully accepted after device testing
        usedAt: new Date()
      }
    });

    // The reminder service cron job will automatically send consultation link 2 minutes before
    const reminderMessage = invite.consultation.scheduledDate
      ? 'You will receive a consultation link via email 2 minutes before your scheduled appointment.'
      : 'You will receive a consultation link via email when the consultation is scheduled.';

    return {
      success: true,
      message: `Invitation accepted successfully! ${reminderMessage}`,
      data: {
        consultation: invite.consultation,
        practitioner: invite.createdBy,
        deviceTestResults,
        scheduledDate: invite.consultation.scheduledDate,
        reminderInfo: {
          enabled: invite.consultation.reminderEnabled,
          scheduledDate: invite.consultation.scheduledDate,
          reminderMessage
        }
      }
    };
  }

  private async schedulePreConsultationEmail(invite: any) {
    // Calculate when to send the pre-consultation email (2 minutes before scheduled time)
    const scheduledDate = new Date(invite.consultation.scheduledDate);
    const reminderTime = new Date(scheduledDate.getTime() - 2 * 60 * 1000); // 2 minutes before

    // In a real implementation, you would use a job queue like Bull or a cron job
    // For now, we'll just log when the email should be sent
    this.logger.log(`Pre-consultation email should be sent at: ${reminderTime.toISOString()} for invitation ${invite.id}`);

    // TODO: Implement actual scheduling using a job queue
    // This could be done with:
    // 1. A background job queue (Bull/Agenda)
    // 2. A cron job that checks for upcoming consultations
    // 3. A scheduled task service
  }

  async sendPreConsultationEmail(invitationId: string) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { id: invitationId },
      include: {
        consultation: true,
        createdBy: true
      }
    });

    if (!invite) {
      throw HttpExceptionHelper.notFound('Invitation not found');
    }

    if (invite.status !== InvitationStatus.USED) {
      throw HttpExceptionHelper.badRequest('Invitation has not been accepted yet');
    }

    // Generate consultation room link
    const patientBaseUrl = this.configService.patientUrl || 'https://app.hcw-at-home.com';
    const consultationRoomUrl = `${patientBaseUrl}/consultation/${invite.consultationId}?token=${invite.token}`;

    const practitionerName = invite.createdBy ?
      `${invite.createdBy.firstName} ${invite.createdBy.lastName}` :
      'HCW@Home practitioner';

    try {
      await this.emailService.sendPreConsultationEmail(
        invite.inviteEmail,
        invite.name || 'Patient',
        practitionerName,
        invite.consultation.id,
        consultationRoomUrl,
        invite.consultation.scheduledDate!
      );

      this.logger.log(`Pre-consultation email sent successfully to ${invite.inviteEmail} for consultation ${invite.consultationId}`);

      return {
        success: true,
        message: 'Pre-consultation email sent successfully'
      };
    } catch (error) {
      this.logger.error('Failed to send pre-consultation email:', error);
      throw new Error(`Failed to send pre-consultation email: ${error.message}`);
    }
  }

  // Method to check and send pre-consultation emails for upcoming consultations
  async checkAndSendUpcomingConsultationEmails() {
    const now = new Date();
    const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);

    // Find invitations for consultations scheduled in the next 2 minutes
    const upcomingInvitations = await this.prisma.consultationInvitation.findMany({
      where: {
        status: InvitationStatus.USED,
        consultation: {
          scheduledDate: {
            gte: now,
            lte: twoMinutesFromNow
          }
        }
      },
      include: {
        consultation: true,
        createdBy: true
      }
    });

    for (const invite of upcomingInvitations) {
      try {
        await this.sendPreConsultationEmail(invite.id);
      } catch (error) {
        this.logger.error(`Failed to send pre-consultation email for invitation ${invite.id}:`, error);
      }
    }

    return {
      success: true,
      message: `Processed ${upcomingInvitations.length} upcoming consultations`,
      data: {
        processed: upcomingInvitations.length
      }
    };
  }

  async getInviteDetails(token: string) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { token },
      include: {
        consultation: {
          include: {
            owner: true
          }
        },
        createdBy: true
      }
    });

    if (!invite) {
      throw HttpExceptionHelper.notFound('Invitation not found');
    }

    // Check if invitation has expired based on consultation time
    // Invitation remains valid until consultation starts
    if (invite.consultation?.scheduledDate) {
      const now = this.getCurrentTimeIST();
      const consultationTime = new Date(invite.consultation.scheduledDate);

      this.logger.log(`[getInviteDetails] Time check (IST):`);
      this.logger.log(`  Current time: ${this.formatTimeIST(now)}`);
      this.logger.log(`  Consultation time: ${this.formatTimeIST(consultationTime)}`);

      if (now >= consultationTime) {
        this.logger.warn(`[getInviteDetails] ❌ Consultation time has passed`);
        throw HttpExceptionHelper.badRequest('Consultation time has passed. Invitation is no longer valid.');
      }

      this.logger.log(`[getInviteDetails] ✅ Invitation is still valid`);
    } else {
      // If no consultation scheduled date, fall back to expiresAt
      const now = this.getCurrentTimeIST();
      if (invite.expiresAt < now) {
        throw HttpExceptionHelper.badRequest('Invitation has expired');
      }
    }

    return {
      success: true,
      data: {
        id: invite.id,
        name: invite.name,
        email: invite.inviteEmail,
        status: invite.status,
        expiresAt: invite.expiresAt,
        consultation: {
          id: invite.consultation.id,
          scheduledDate: invite.consultation.scheduledDate,
        },
        practitioner: {
          name: invite.createdBy ? `${invite.createdBy.firstName} ${invite.createdBy.lastName}` : 'Unknown',
        }
      }
    };
  }

  /**
   * Join consultation via reminder email link
   * This marks the invitation as ACCEPTED if it was still PENDING
   * and returns the consultation details for redirection to waiting room
   */
  async joinConsultationViaReminder(token: string) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { token },
      include: {
        consultation: true,
        createdBy: true
      }
    });

    if (!invite) {
      throw HttpExceptionHelper.notFound('Invitation not found');
    }

    // Check if consultation time is valid (shouldn't be in the past)
    if (invite.consultation?.scheduledDate) {
      const now = this.getCurrentTimeIST();
      const consultationTime = new Date(invite.consultation.scheduledDate);

      this.logger.log(`[joinConsultationViaReminder] Time check (IST):`);
      this.logger.log(`  Current time: ${this.formatTimeIST(now)}`);
      this.logger.log(`  Consultation time: ${this.formatTimeIST(consultationTime)}`);

      if (now > consultationTime) {
        this.logger.warn(`[joinConsultationViaReminder] ❌ Consultation time has passed`);
        throw HttpExceptionHelper.badRequest('Consultation time has passed.');
      }

      this.logger.log(`[joinConsultationViaReminder] ✅ Time check passed`);
    }

    // Auto-accept invitation if still PENDING when joining via reminder link
    if (invite.status === InvitationStatus.PENDING) {
      await this.prisma.consultationInvitation.update({
        where: { token },
        data: {
          status: InvitationStatus.USED,
          usedAt: new Date()
        }
      });
      this.logger.log(`Auto-accepted invitation ${invite.id} when patient clicked join link from reminder email`);
    }

    // Even if already USED, we allow the join to proceed
    if (invite.status !== InvitationStatus.USED) {
      throw HttpExceptionHelper.badRequest('Invitation is not valid for joining');
    }

    // Return consultation details for frontend to redirect to waiting room
    const patientBaseUrl = this.configService.patientUrl || 'http://localhost:4201';
    const waitingRoomUrl = `${patientBaseUrl}/consultation/${invite.consultationId}/waiting-room?token=${token}`;

    return {
      success: true,
      message: 'Joining consultation. Redirecting to virtual waiting room...',
      data: {
        consultationId: invite.consultationId,
        token: invite.token,
        waitingRoomUrl,
        redirectTo: 'waiting-room',
        consultation: invite.consultation,
        practitioner: invite.createdBy,
        invitationStatus: invite.status
      }
    };
  }

  /**
   * Create invitation with email - from ConsultationInvitationService
   * This is used by mediasoup.gateway and consultation.service
   */
  async createInvitationEmail(
    consultationId: number,
    inviterUserId: number,
    inviteEmail: string,
    role: UserRole,
    name?: string,
    notes?: string,
    expiresInMinutes = 60,
  ) {
    if (!ALLOWED_INVITE_ROLES.includes(role)) {
      throw new Error(`Invalid invitation role: ${role}`);
    }

    if (!inviteEmail || !inviteEmail.trim()) {
      throw new Error('Invite email is required');
    }

    const inviterUser = await this.prisma.user.findUnique({
      where: { id: inviterUserId },
      select: { role: true },
    });

    if (
      !inviterUser ||
      !([UserRole.PRACTITIONER, UserRole.ADMIN] as UserRole[]).includes(
        inviterUser.role,
      )
    ) {
      throw new Error('Only practitioners or admins can send invitations');
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { ownerId: true, scheduledDate: true },
    });
    if (!consultation) throw new Error('Consultation not found');
    if (
      inviterUser.role === UserRole.PRACTITIONER &&
      consultation.ownerId !== inviterUserId
    ) {
      throw new Error('Not authorized to invite for this consultation');
    }

    const existing = await this.prisma.consultationInvitation.findFirst({
      where: {
        consultationId,
        inviteEmail: { equals: inviteEmail.trim(), mode: 'insensitive' },
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      throw new Error('A pending invitation already exists for this email');
    }

    const expireTime = addMinutes(new Date(), expiresInMinutes);
    const token = uuidv4();

    const invitation = await this.prisma.consultationInvitation.create({
      data: {
        consultationId,
        inviteEmail: inviteEmail.trim(),
        name: name || null,
        notes: notes || null,
        role,
        token,
        expiresAt: expireTime,
        status: InvitationStatus.PENDING,
        createdById: inviterUserId,
      },
    });

    this.logger.log(`Created invitation ${invitation.id} for consultation ${consultationId} by user ${inviterUserId}`);

    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterUserId },
      select: { firstName: true, lastName: true },
    });
    const inviterName = inviter
      ? `${inviter.firstName ?? ''} ${inviter.lastName ?? ''}`.trim()
      : 'A practitioner';

    const patientBaseUrl = this.configService.patientUrl || 'http://localhost:4201';
    const acknowledgeLink = `${patientBaseUrl}/acknowledge-invite/${token}`;

    this.logger.log(
      `Creating acknowledgement link for invitation: ${acknowledgeLink}`,
    );

    // Format scheduled date in IST if available
    let scheduledTimeIST: string | undefined = undefined;
    let deviceTestCutoffIST: string | undefined = undefined;

    if (consultation.scheduledDate) {
      const consultationTime = new Date(consultation.scheduledDate);
      const twoMinutesBefore = new Date(consultationTime.getTime() - 2 * 60 * 1000);

      scheduledTimeIST = this.formatTimeIST(consultationTime);
      deviceTestCutoffIST = this.formatTimeIST(twoMinutesBefore);

      this.logger.log(`[createInvitationEmail] IST Times:`, {
        consultation: scheduledTimeIST,
        deviceTestCutoff: deviceTestCutoffIST
      });
    }

    try {
      await this.emailService.sendConsultationInvitationEmail(
        inviteEmail.trim(),
        inviterName,
        consultationId,
        acknowledgeLink,
        role,
        name,
        notes,
        scheduledTimeIST,
        deviceTestCutoffIST
      );
      this.logger.log(
        `Sent ${role} invitation email to ${inviteEmail} for consultation ${consultationId} by ${inviterUserId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send invitation email to ${inviteEmail}: ${error.message}`,
        error,
      );
    }

    return invitation;
  }

  /**
   * Alias method for createInvitationEmail for backward compatibility
   */
  async createInvitation(
    consultationId: number,
    inviterUserId: number,
    inviteEmail: string,
    role: UserRole,
    name?: string,
    notes?: string,
    expiresInMinutes = 60,
  ) {
    this.logger.log(`Creating invitation for consultation ${consultationId} by user ${inviterUserId} for ${inviteEmail} with role ${role}`);
    return this.createInvitationEmail(
      consultationId,
      inviterUserId,
      inviteEmail,
      role,
      name,
      notes,
      expiresInMinutes,
    );
  }

  /**
   * Validate invitation token
   */
  async validateToken(token: string) {
    const invite = await this.prisma.consultationInvitation.findUnique({
      where: { token },
      include: {
        consultation: true
      }
    });

    if (!invite) {
      throw new Error('Invalid invitation token');
    }
    if (invite.status !== InvitationStatus.PENDING && invite.status !== InvitationStatus.USED) {
      throw new Error(`Invitation is ${invite.status.toLowerCase()}`);
    }

    // Check expiration based on consultation time if available
    if (invite.consultation?.scheduledDate) {
      const now = new Date();
      const consultationTime = new Date(invite.consultation.scheduledDate);

      if (now >= consultationTime) {
        await this.prisma.consultationInvitation.update({
          where: { token },
          data: { status: InvitationStatus.EXPIRED },
        });
        throw new Error('Consultation time has passed. Invitation is no longer valid.');
      }
    } else {
      // Fall back to expiresAt if no consultation scheduled
      if (isAfter(new Date(), invite.expiresAt)) {
        await this.prisma.consultationInvitation.update({
          where: { token },
          data: { status: InvitationStatus.EXPIRED },
        });
        throw new Error('Invitation link has expired');
      }
    }

    return invite;
  }

  /**
   * Mark invitation as used
   */
  async markUsed(token: string, userId: number): Promise<void> {
    await this.prisma.consultationInvitation.update({
      where: { token },
      data: {
        status: InvitationStatus.USED,
        usedAt: new Date(),
        invitedUserId: userId,
      },
    });
  }

  /**
   * Expire old invitations
   */
  async expireOldInvitations(): Promise<void> {
    const now = new Date();
    const expiredInvites = await this.prisma.consultationInvitation.findMany({
      where: {
        status: InvitationStatus.PENDING,
        expiresAt: { lt: now },
      },
    });

    for (const invite of expiredInvites) {
      try {
        await this.prisma.consultationInvitation.update({
          where: { id: invite.id },
          data: { status: InvitationStatus.EXPIRED },
        });
      } catch (error) {
        this.logger.error(
          `Failed to expire invitation ${invite.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Expired ${expiredInvites.length} invitations`);
  }

  /**
   * Gets all invitations for a consultation
   */
  async getConsultationInvitations(consultationId: number): Promise<any[]> {
    return await this.prisma.consultationInvitation.findMany({
      where: { consultationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Gets invitation statistics for a consultation
   */
  async getInvitationStats(consultationId: number): Promise<{
    total: number;
    pending: number;
    used: number;
    expired: number;
    revoked: number;
  }> {
    const invitations = await this.prisma.consultationInvitation.findMany({
      where: { consultationId },
      select: { status: true },
    });

    const stats = {
      total: invitations.length,
      pending: 0,
      used: 0,
      expired: 0,
      revoked: 0,
    };

    invitations.forEach((inv) => {
      switch (inv.status) {
        case InvitationStatus.PENDING:
          stats.pending++;
          break;
        case InvitationStatus.USED:
          stats.used++;
          break;
        case InvitationStatus.EXPIRED:
          stats.expired++;
          break;
        case InvitationStatus.REVOKED:
          stats.revoked++;
          break;
      }
    });

    return stats;
  }

  /**
   * Validates bulk invitation email formats
   */
  validateBulkEmails(emails: string[]): {
    valid: string[];
    invalid: Array<{ email: string; error: string }>;
  } {
    const valid: string[] = [];
    const invalid: Array<{ email: string; error: string }> = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    emails.forEach((email) => {
      if (!email || !email.trim()) {
        invalid.push({ email: email || '', error: 'Email is required' });
      } else if (!emailRegex.test(email.trim())) {
        invalid.push({ email, error: 'Invalid email format' });
      } else {
        valid.push(email.trim().toLowerCase());
      }
    });

    return { valid, invalid };
  }

  /**
   * Checks if email already has pending invitation for consultation
   */
  async hasPendingInvitation(
    consultationId: number,
    email: string,
  ): Promise<boolean> {
    const invitation = await this.prisma.consultationInvitation.findFirst({
      where: {
        consultationId,
        inviteEmail: email.toLowerCase().trim(),
        status: InvitationStatus.PENDING,
      },
    });

    return !!invitation;
  }
}
