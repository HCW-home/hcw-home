import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import {
  ConnectionQualityDto,
  MediaDeviceStatusDto,
  RealTimeEventDto,
  WaitingRoomSessionDto,
  TypingIndicatorDto
} from './dto/enhanced-realtime.dto';
import {
  UpdateMediaDeviceStatusDto,
  UpdateConnectionQualityDto,
  AdmitPatientDto,
  CreateRealTimeEventDto,
  UpdateTypingIndicatorDto,
  RealtimeWaitingRoomStatsDto
} from './dto/realtime-input.dto';
import { ConsultationStatus, UserRole } from '@prisma/client';

@Injectable()
export class EnhancedRealtimeService {
  private readonly logger = new Logger(EnhancedRealtimeService.name);

  constructor(private readonly databaseService: DatabaseService) { }

  async enterWaitingRoom(consultationId: number, userId: number): Promise<WaitingRoomSessionDto> {
    // Check if consultation exists and is in waiting status
    const consultation = await this.databaseService.consultation.findUnique({
      where: { id: consultationId }
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }
    if (!consultation.waitingRoomEnabled) {
      throw HttpExceptionHelper.badRequest('Waiting room is not enabled for this consultation');
    }

    // Check if user already has an active waiting room session
    const existingSession = await this.databaseService.waitingRoomSession.findFirst({
      where: {
        consultationId,
        userId,
        status: 'waiting'
      }
    });

    if (existingSession) {
      return {
        id: existingSession.id,
        consultationId: existingSession.consultationId,
        userId: existingSession.userId,
        enteredAt: existingSession.enteredAt,
        admittedAt: existingSession.admittedAt || undefined,
        leftAt: existingSession.leftAt || undefined,
        estimatedWaitTime: existingSession.estimatedWaitTime || undefined,
        queuePosition: existingSession.queuePosition || undefined,
        status: existingSession.status
      };
    }

    // Get current queue position
    const waitingCount = await this.databaseService.waitingRoomSession.count({
      where: {
        consultationId,
        status: 'waiting'
      }
    });

    // Create new waiting room session
    const session = await this.databaseService.waitingRoomSession.create({
      data: {
        consultationId,
        userId,
        queuePosition: waitingCount + 1,
        estimatedWaitTime: this.calculateEstimatedWaitTime(waitingCount + 1),
        status: 'waiting'
      }
    });

    // Update participant status
    await this.databaseService.participant.upsert({
      where: {
        consultationId_userId: {
          consultationId,
          userId
        }
      },
      update: {
        inWaitingRoom: true,
        waitingRoomEnteredAt: new Date()
      },
      create: {
        consultationId,
        userId,
        role: UserRole.PATIENT,
        inWaitingRoom: true,
        waitingRoomEnteredAt: new Date()
      }
    });

    // Create real-time event
    await this.createRealTimeEvent(consultationId, userId, {
      eventType: 'patient_entered_waiting_room',
      message: `Patient entered waiting room`,
      eventData: {
        queuePosition: session.queuePosition,
        estimatedWaitTime: session.estimatedWaitTime
      }
    });

    return {
      id: session.id,
      consultationId: session.consultationId,
      userId: session.userId,
      enteredAt: session.enteredAt,
      admittedAt: session.admittedAt || undefined,
      leftAt: session.leftAt || undefined,
      estimatedWaitTime: session.estimatedWaitTime || undefined,
      queuePosition: session.queuePosition || undefined,
      status: session.status
    };
  }

  async admitPatient(consultationId: number, patientId: number, admittedBy: number, dto?: AdmitPatientDto): Promise<void> {
    // Update waiting room session
    const session = await this.databaseService.waitingRoomSession.findFirst({
      where: {
        consultationId,
        userId: patientId,
        status: 'waiting'
      }
    });

    if (!session) {
      throw HttpExceptionHelper.notFound('Patient not found in waiting room');
    }

    await this.databaseService.waitingRoomSession.update({
      where: { id: session.id },
      data: {
        status: 'admitted',
        admittedAt: new Date()
      }
    });

    // Update participant
    await this.databaseService.participant.update({
      where: {
        consultationId_userId: {
          consultationId,
          userId: patientId
        }
      },
      data: {
        inWaitingRoom: false,
        admittedAt: new Date(),
        admittedBy
      }
    });

    // Update consultation status if needed
    await this.databaseService.consultation.update({
      where: { id: consultationId },
      data: {
        status: ConsultationStatus.ACTIVE,
        startedAt: new Date()
      }
    });

    // Requeue remaining patients
    await this.reorderWaitingQueue(consultationId);

    // Create real-time event
    await this.createRealTimeEvent(consultationId, patientId, {
      eventType: 'patient_admitted',
      message: dto?.welcomeMessage || 'You have been admitted to the consultation',
      eventData: {
        admittedBy,
        admittedAt: new Date()
      }
    });
  }

  async updateMediaDeviceStatus(
    consultationId: number,
    userId: number,
    dto: UpdateMediaDeviceStatusDto
  ): Promise<MediaDeviceStatusDto> {
    const deviceStatus = await this.databaseService.mediaDeviceStatus.upsert({
      where: {
        userId_consultationId: {
          userId,
          consultationId
        }
      },
      update: {
        ...dto,
        lastUpdated: new Date()
      },
      create: {
        userId,
        consultationId,
        ...dto,
        lastUpdated: new Date()
      }
    });

    // Create real-time event for device status changes
    await this.createRealTimeEvent(consultationId, userId, {
      eventType: 'media_device_status_updated',
      eventData: dto
    });

    return deviceStatus;
  }

  async getMediaDeviceStatus(consultationId: number, userId: number): Promise<MediaDeviceStatusDto | null> {
    return this.databaseService.mediaDeviceStatus.findUnique({
      where: {
        userId_consultationId: {
          userId,
          consultationId
        }
      }
    });
  }

  async updateConnectionQuality(
    consultationId: number,
    userId: number,
    dto: UpdateConnectionQualityDto
  ): Promise<ConnectionQualityDto> {
    const connectionQuality = await this.databaseService.connectionQuality.create({
      data: {
        userId,
        consultationId,
        ...dto
      }
    });

    // Update participant connection quality score
    if (dto.signalStrength !== undefined) {
      await this.databaseService.participant.updateMany({
        where: {
          consultationId,
          userId
        },
        data: {
          connectionQualityScore: dto.signalStrength
        }
      });
    }

    return {
      ...connectionQuality,
      packetLoss: Number(connectionQuality.packetLoss)
    };
  }

  async getConnectionQualityHistory(consultationId: number, userId: number): Promise<ConnectionQualityDto[]> {
    const results = await this.databaseService.connectionQuality.findMany({
      where: {
        consultationId,
        userId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    return results.map(result => ({
      ...result,
      packetLoss: Number(result.packetLoss)
    }));
  }


  async createRealTimeEvent(
    consultationId: number,
    userId: number | null,
    dto: CreateRealTimeEventDto
  ): Promise<RealTimeEventDto> {
    const event = await this.databaseService.realTimeEvent.create({
      data: {
        consultationId,
        userId,
        ...dto
      }
    });

    return {
      ...event,
      userId: event.userId || undefined,
      message: event.message || undefined
    };
  }

  async getRealTimeEvents(consultationId: number, limit: number = 50): Promise<RealTimeEventDto[]> {
    const events = await this.databaseService.realTimeEvent.findMany({
      where: {
        consultationId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    return events.map(event => ({
      ...event,
      userId: event.userId || undefined,
      message: event.message || undefined
    }));
  }


  async updateTypingIndicator(
    consultationId: number,
    userId: number,
    dto: UpdateTypingIndicatorDto
  ): Promise<TypingIndicatorDto> {
    const indicator = await this.databaseService.typingIndicator.upsert({
      where: {
        userId_consultationId: {
          userId,
          consultationId
        }
      },
      update: {
        isTyping: dto.isTyping,
        lastUpdated: new Date()
      },
      create: {
        userId,
        consultationId,
        isTyping: dto.isTyping,
        lastUpdated: new Date()
      }
    });

    return indicator;
  }

  async getTypingIndicators(consultationId: number): Promise<TypingIndicatorDto[]> {
    return this.databaseService.typingIndicator.findMany({
      where: {
        consultationId,
        isTyping: true,
        lastUpdated: {
          gte: new Date(Date.now() - 10000) // Only show indicators from last 10 seconds
        }
      }
    });
  }

  private calculateEstimatedWaitTime(queuePosition: number): number {
    return Math.max(5, queuePosition * 5);
  }

  private async reorderWaitingQueue(consultationId: number): Promise<void> {
    const waitingSessions = await this.databaseService.waitingRoomSession.findMany({
      where: {
        consultationId,
        status: 'waiting'
      },
      orderBy: {
        enteredAt: 'asc'
      }
    });

    for (let i = 0; i < waitingSessions.length; i++) {
      await this.databaseService.waitingRoomSession.update({
        where: { id: waitingSessions[i].id },
        data: {
          queuePosition: i + 1,
          estimatedWaitTime: this.calculateEstimatedWaitTime(i + 1)
        }
      });
    }
  }

  async removeParticipant(consultationId: number, participantId: number, removedBy: number): Promise<void> {
    try {
      // Mark participant as inactive
      await this.databaseService.participant.update({
        where: {
          consultationId_userId: {
            consultationId,
            userId: participantId
          }
        },
        data: {
          isActive: false,
          lastSeenAt: new Date()
        }
      });

      // Create real-time event
      const user = await this.databaseService.user.findUnique({
        where: { id: participantId },
        select: { firstName: true, lastName: true, role: true }
      });

      await this.createRealTimeEvent(consultationId, removedBy, {
        eventType: 'participant_removed',
        message: `${user?.firstName || 'Participant'} has been removed from the consultation`,
        eventData: {
          removedParticipantId: participantId,
          removedParticipantName: `${user?.firstName} ${user?.lastName}`,
          removedParticipantRole: user?.role
        }
      });

    } catch (error) {
      this.logger.error(`Failed to remove participant: ${error.message}`);
      throw error;
    }
  }


  async handleMediaPermissionError(
    consultationId: number,
    userId: number,
    errorType: 'camera_denied' | 'microphone_denied' | 'device_unavailable' | 'device_in_use',
    errorDetails: string
  ): Promise<void> {
    try {
      // Update media device status
      await this.databaseService.mediaDeviceStatus.upsert({
        where: {
          userId_consultationId: {
            userId,
            consultationId
          }
        },
        update: {
          cameraBlocked: errorType === 'camera_denied',
          microphoneBlocked: errorType === 'microphone_denied',
          lastUpdated: new Date()
        },
        create: {
          userId,
          consultationId,
          cameraAvailable: errorType !== 'device_unavailable',
          cameraBlocked: errorType === 'camera_denied',
          microphoneAvailable: errorType !== 'device_unavailable',
          microphoneBlocked: errorType === 'microphone_denied'
        }
      });

      // Create system message for user guidance
      await this.createRealTimeEvent(consultationId, userId, {
        eventType: 'media_permission_error',
        message: this.getMediaErrorMessage(errorType),
        eventData: {
          errorType,
          errorDetails,
          guidance: this.getMediaErrorGuidance(errorType)
        }
      });

    } catch (error) {
      this.logger.error(`Failed to handle media permission error: ${error.message}`);
    }
  }


  async createSystemNotification(
    consultationId: number,
    messageType: 'waiting_time_update' | 'connection_quality_warning' | 'participant_limit_reached',
    messageData: any
  ): Promise<void> {
    try {
      const systemMessage = this.getSystemNotificationMessage(messageType, messageData);

      await this.createRealTimeEvent(consultationId, null, {
        eventType: messageType,
        message: systemMessage,
        eventData: messageData
      });

    } catch (error) {
      this.logger.error(`Failed to create system notification: ${error.message}`);
    }
  }


  private getMediaErrorMessage(errorType: string): string {
    switch (errorType) {
      case 'camera_denied':
        return 'Camera access was denied. Please allow camera access to participate in video calls.';
      case 'microphone_denied':
        return 'Microphone access was denied. Please allow microphone access to participate in audio calls.';
      case 'device_unavailable':
        return 'Camera or microphone device not found. Please check your device connections.';
      case 'device_in_use':
        return 'Camera or microphone is being used by another application. Please close other applications and try again.';
      default:
        return 'Media device error occurred. Please check your camera and microphone settings.';
    }
  }

  private getMediaErrorGuidance(errorType: string): string {
    switch (errorType) {
      case 'camera_denied':
      case 'microphone_denied':
        return 'Click the camera icon in your browser address bar and select "Allow" for camera and microphone access.';
      case 'device_unavailable':
        return 'Make sure your camera and microphone are properly connected and try refreshing the page.';
      case 'device_in_use':
        return 'Close other video conferencing applications (Zoom, Teams, etc.) and refresh the page.';
      default:
        return 'Try refreshing the page or contact support if the problem persists.';
    }
  }

  private getSystemNotificationMessage(messageType: string, messageData: any): string {
    switch (messageType) {
      case 'waiting_time_update':
        return `Estimated waiting time updated: ${messageData.estimatedTime} minutes`;
      case 'connection_quality_warning':
        return 'Poor connection quality detected. Consider switching to a more stable network.';
      case 'participant_limit_reached':
        return 'Maximum number of participants reached for this consultation.';
      default:
        return 'System notification';
    }
  }
}
