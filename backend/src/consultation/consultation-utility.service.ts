import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from 'src/config/config.service';
import { UserRole, ConsultationStatus } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { MediasoupSessionService } from 'src/mediasoup/mediasoup-session.service';
import {
  IConsultationGateway,
  CONSULTATION_GATEWAY_TOKEN,
} from './interfaces/consultation-gateway.interface';

/**
 * Consultation Utility Service
 *
 * This service handles utility functions for consultation management:
 * - URL generation and routing
 * - Role-based capabilities and permissions
 * - WebSocket event emission
 * - Media session utilities
 * - Session state management
 */
@Injectable()
export class ConsultationUtilityService {
  private readonly logger = new Logger(ConsultationUtilityService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => CONSULTATION_GATEWAY_TOKEN))
    private readonly consultationGateway: IConsultationGateway,
    private readonly mediasoupSessionService: MediasoupSessionService,
  ) { }

  /**
   * Generate appropriate magic link URL based on user role
   */
  generateMagicLinkUrl(token: string, role: UserRole): string {
    const baseUrl = this.getBaseUrlForRole(role);
    return `${baseUrl}/join-consultation?token=${token}`;
  }

  /**
   * Get base URL for different user roles - Each role uses their own frontend origin
   */
  getBaseUrlForRole(role: UserRole): string {
    // Each participant type uses their own CORS origin/frontend URL
    // but all access the same consultation room interface from their respective frontends
    let baseUrl: string;

    switch (role) {
      case UserRole.PATIENT:
        baseUrl =
          this.configService.patientUrl || this.configService.corsOrigin[2];
        break;
      case UserRole.PRACTITIONER:
        baseUrl =
          this.configService.practitionerUrl ||
          this.configService.corsOrigin[1];
        break;
      case UserRole.EXPERT:
      case UserRole.GUEST:
        // Experts and guests use practitioner frontend but maintain their own access
        baseUrl =
          this.configService.practitionerUrl ||
          this.configService.corsOrigin[1];
        break;
      case UserRole.ADMIN:
        baseUrl =
          this.configService.adminUrl || this.configService.corsOrigin[0];
        break;
      default:
        baseUrl = this.configService.patientUrl;
        break;
    }

    if (!baseUrl) {
      this.logger.error(
        `No base URL configured for role: ${role}. Please check your environment configuration.`,
      );
      throw new Error(`Base URL not configured for user role: ${role}`);
    }

    return baseUrl;
  }

  /**
   * Generate session URL for consultation participants - Same consultation room, different frontend routes
   */
  generateSessionUrl(
    consultationId: number,
    userRole: UserRole,
    isWaitingRoom: boolean = false,
  ): string {
    // All participants use the same consultation room interface
    // Frontend routing handles role-specific features and UI differences
    if (isWaitingRoom && userRole === UserRole.PATIENT) {
      return `/waiting-room/${consultationId}`;
    }
    // All participants (including patients after admission) use the same consultation room
    // Frontend will handle role-based UI and feature differences
    return `/consultation-room/${consultationId}`;
  }

  /**
   * Emit consultation state change events via WebSocket
   */
  emitConsultationStateChange(
    consultationId: number,
    eventType: string,
    data: any,
    targetRoom?: string,
  ): void {
    if (!this.consultationGateway.server) {
      this.logger.warn(
        'WebSocket server not available for state change emission',
      );
      return;
    }

    const room = targetRoom || `consultation:${consultationId}`;
    this.consultationGateway.server.to(room).emit(eventType, {
      consultationId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Ensure media session is ready for consultation
   */
  async ensureMediaSessionForConsultation(
    consultationId: number,
  ): Promise<boolean> {
    try {
      const router =
        await this.mediasoupSessionService.ensureRouterForConsultation(
          consultationId,
        );
      if (router) {
        this.emitConsultationStateChange(
          consultationId,
          'media_session_ready',
          {
            routerId: consultationId,
            message: 'WebRTC media session is ready',
          },
        );
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(
        `Failed to ensure media session for consultation ${consultationId}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Handle consultation room transitions and emit appropriate events
   */
  async handleConsultationRoomTransition(
    consultationId: number,
    fromState: 'waiting' | 'consultation',
    toState: 'waiting' | 'consultation',
    participantIds: number[],
    initiatedBy: UserRole,
  ): Promise<void> {
    try {
      if (fromState === 'waiting' && toState === 'consultation') {
        // Moving from waiting room to consultation room
        this.emitConsultationStateChange(
          consultationId,
          'transition_to_consultation_room',
          {
            participantIds,
            fromState,
            toState,
            initiatedBy,
            message: 'All participants are being moved to consultation room',
            features: {
              chat: true,
              voice: true,
              video: true,
              screenShare: true,
              fileShare: true,
            },
          },
        );

        await this.ensureMediaSessionForConsultation(consultationId);

        // Update consultation status
        await this.db.consultation.update({
          where: { id: consultationId },
          data: {
            status: ConsultationStatus.ACTIVE,
            version: { increment: 1 },
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle consultation room transition for ${consultationId}:`,
        error.message,
      );
    }
  }

  /**
   * Get consultation capabilities based on user role and consultation state
   */
  getConsultationCapabilities(
    role: UserRole,
    isInWaitingRoom: boolean = false,
  ) {
    if (isInWaitingRoom) {
      return {
        features: {
          chat: role === UserRole.PATIENT, // Patients can chat in waiting room
          voice: false,
          video: false,
          screenShare: false,
          fileShare: false,
        },
        mediaConfig: {
          audioEnabled: false,
          videoEnabled: false,
          screenShareEnabled: false,
        },
      };
    }

    // Consultation room capabilities
    switch (role) {
      case UserRole.PRACTITIONER:
        return {
          features: {
            chat: true,
            voice: true,
            video: true,
            screenShare: true,
            fileShare: true,
          },
          mediaConfig: {
            audioEnabled: true,
            videoEnabled: true,
            screenShareEnabled: true,
          },
        };
      case UserRole.EXPERT:
        return {
          features: {
            chat: true,
            voice: true,
            video: true,
            screenShare: true,
            fileShare: true,
          },
          mediaConfig: {
            audioEnabled: true,
            videoEnabled: true,
            screenShareEnabled: true,
          },
        };
      case UserRole.PATIENT:
        return {
          features: {
            chat: true,
            voice: true,
            video: true,
            screenShare: false, // Patients typically don't screen share
            fileShare: true,
          },
          mediaConfig: {
            audioEnabled: true,
            videoEnabled: true,
            screenShareEnabled: false,
          },
        };
      case UserRole.GUEST:
        return {
          features: {
            chat: true,
            voice: true,
            video: true,
            screenShare: false, // Guests have limited screen share
            fileShare: false, // Guests have limited file share
          },
          mediaConfig: {
            audioEnabled: true,
            videoEnabled: true,
            screenShareEnabled: false,
          },
        };
      default:
        return {
          features: {
            chat: true,
            voice: false,
            video: false,
            screenShare: false,
            fileShare: false,
          },
          mediaConfig: {
            audioEnabled: false,
            videoEnabled: false,
            screenShareEnabled: false,
          },
        };
    }
  }

  /**
   * Track participant media session state changes
   */
  async updateParticipantMediaStatus(
    consultationId: number,
    userId: number,
    action: string,
    metadata?: any,
  ): Promise<void> {
    try {
      // Update participant last active time and media state
      await this.db.participant.updateMany({
        where: {
          consultationId,
          userId,
        },
        data: {
          lastActiveAt: new Date(),
          lastSeenAt: new Date(),
        },
      });

      // Log media event for tracking and analytics
      this.logger.debug(
        `Participant ${userId} media action: ${action} in consultation ${consultationId}`,
        metadata,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update participant media status: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Clean up MediaSoup session when consultation ends
   */
  async cleanupMediaSoupSession(consultationId: number): Promise<void> {
    try {
      // Clean up MediaSoup router and all associated resources
      await this.mediasoupSessionService.cleanupRouterForConsultation(
        consultationId,
      );

      this.emitConsultationStateChange(consultationId, 'media_session_closed', {
        closedAt: new Date(),
      });

      this.logger.log(
        `MediaSoup session cleaned up for consultation ${consultationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cleanup MediaSoup session: ${error.message}`,
      );
    }
  }
}
