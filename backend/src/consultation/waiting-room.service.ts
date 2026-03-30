import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import { DatabaseService } from '../database/database.service';
import { ConsultationStatus, UserRole } from '@prisma/client';
import {
  WaitingRoomConsultationDto,
  WaitingRoomStatsDto,
  PractitionerWaitingRoomDto,
  JoinWaitingRoomDto,
  AdmitFromWaitingRoomDto,
  LiveConsultationJoinDto,
  LiveConsultationDataDto,
  ConsultationParticipantDto,
  WaitingRoomSessionDto
} from './dto/waiting-room.dto';
import { RealtimeWaitingRoomStatsDto } from './dto/realtime-input.dto';
import { ChatService } from '../chat/chat.service';
import {
  IConsultationGateway,
  CONSULTATION_GATEWAY_TOKEN
} from './interfaces/consultation-gateway.interface';
import { ConfigService } from '../config/config.service';

@Injectable()
export class WaitingRoomService {
  private readonly logger = new Logger(WaitingRoomService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => CONSULTATION_GATEWAY_TOKEN))
    private readonly consultationGateway: IConsultationGateway,
  ) { }

  /**
   * Get all consultations in waiting room for a practitioner
   */
  async getPractitionerWaitingRoom(
    practitionerId: number,
    page = 1,
    limit = 10,
    sortOrder: 'asc' | 'desc' = 'asc'
  ): Promise<PractitionerWaitingRoomDto> {
    // Verify practitioner exists
    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
      select: {
        id: true,
        role: true,
        GroupMember: { select: { groupId: true } },
        specialities: { select: { specialityId: true } }
      }
    });

    if (!practitioner) {
      throw HttpExceptionHelper.notFound('Practitioner not found');
    }

    if (practitioner.role !== UserRole.PRACTITIONER) {
      throw HttpExceptionHelper.badRequest('User is not a practitioner');
    }

    const skip = (page - 1) * limit;
    const practitionerGroupIds = practitioner.GroupMember.map(gm => gm.groupId);
    const practitionerSpecialityIds = practitioner.specialities.map(s => s.specialityId);

    const consultations = await this.db.consultation.findMany({
      where: {
        status: ConsultationStatus.WAITING,
        participants: {
          some: {
            role: UserRole.PATIENT,
            isActive: true,
            inWaitingRoom: true
          }
        },
        OR: [
          { ownerId: practitionerId },
          { ownerId: null, groupId: { in: practitionerGroupIds } },
          { ownerId: null, specialityId: { in: practitionerSpecialityIds } }
        ]
      },
      include: {
        participants: {
          where: { role: UserRole.PATIENT },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        waitingRoomSessions: {
          where: { status: 'waiting' },
          orderBy: { enteredAt: 'asc' }
        }
      },
      orderBy: {
        createdAt: sortOrder
      },
      skip,
      take: limit
    });

    const totalCount = await this.db.consultation.count({
      where: {
        status: ConsultationStatus.WAITING,
        participants: {
          some: {
            role: UserRole.PATIENT,
            isActive: true,
            inWaitingRoom: true
          }
        },
        OR: [
          { ownerId: practitionerId },
          { ownerId: null, groupId: { in: practitionerGroupIds } },
          { ownerId: null, specialityId: { in: practitionerSpecialityIds } }
        ]
      }
    });

    // Transform to DTOs
    const consultationDtos: WaitingRoomConsultationDto[] = consultations.map(consultation => {
      const patient = consultation.participants.find(p => p.role === UserRole.PATIENT);
      const waitingSession = consultation.waitingRoomSessions[0];

      const waitTime = patient?.waitingRoomEnteredAt
        ? Math.floor((Date.now() - patient.waitingRoomEnteredAt.getTime()) / (1000 * 60))
        : 0;

      return {
        id: consultation.id,
        scheduledDate: consultation.scheduledDate || undefined,
        status: consultation.status,
        symptoms: consultation.symptoms || undefined,
        patient: {
          id: patient?.user.id || 0,
          initials: patient ? `${patient.user.firstName[0]}${patient.user.lastName[0]}` : 'N/A',
          joinedAt: patient?.waitingRoomEnteredAt || undefined,
          language: patient?.language || undefined,
          waitTime
        },
        patientJoinedAt: patient?.waitingRoomEnteredAt || undefined,
        patientInWaitingRoom: patient?.inWaitingRoom || false,
        currentWaitTime: waitTime,
        queuePosition: waitingSession?.queuePosition || undefined,
        preferredLanguage: patient?.language || undefined
      };
    });

    // Calculate stats
    const stats = await this.calculateWaitingRoomStats(practitionerId);

    return {
      consultations: consultationDtos,
      stats,
      totalCount,
      page,
      limit
    };
  }

  /**
   * Patient joins waiting room via magic link
   */
  async joinWaitingRoom(dto: JoinWaitingRoomDto): Promise<{ success: boolean; waitingRoomSession: any }> {
    const { consultationId, userId, preferredLanguage } = dto;

    // Verify consultation exists and is accessible
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        participants: {
          where: { userId }
        }
      }
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    if (!consultation.waitingRoomEnabled) {
      throw HttpExceptionHelper.badRequest('Waiting room is not enabled for this consultation');
    }

    // Verify user is a participant
    const participant = consultation.participants[0];
    if (!participant) {
      throw HttpExceptionHelper.badRequest('User is not a participant in this consultation');
    }

    // Update consultation status to WAITING if not already
    if (consultation.status === ConsultationStatus.SCHEDULED) {
      await this.db.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.WAITING }
      });
    }

    // Update participant as active and in waiting room
    await this.db.participant.update({
      where: {
        consultationId_userId: {
          consultationId,
          userId
        }
      },
      data: {
        isActive: true,
        inWaitingRoom: true,
        waitingRoomEnteredAt: new Date(),
        language: preferredLanguage || participant.language,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
        lastActiveAt: new Date()
      }
    });

    // Create or update waiting room session
    const existingSession = await this.db.waitingRoomSession.findFirst({
      where: {
        consultationId,
        userId,
        status: 'waiting'
      }
    });

    let waitingRoomSession;

    if (!existingSession) {
      // Get current queue position
      const waitingCount = await this.db.waitingRoomSession.count({
        where: {
          consultationId,
          status: 'waiting'
        }
      });

      waitingRoomSession = await this.db.waitingRoomSession.create({
        data: {
          consultationId,
          userId,
          queuePosition: waitingCount + 1,
          estimatedWaitTime: this.calculateEstimatedWaitTime(waitingCount + 1),
          status: 'waiting'
        }
      });
    } else {
      waitingRoomSession = existingSession;
    }

    // Get user data for the patient
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, country: true }
    });

    // Emit real-time event to practitioners with sound alert if enabled
    this.emitToConsultationPractitioners(consultationId, 'patient_joined_waiting_room', {
      consultationId,
      patientId: userId,
      patientFirstName: user?.firstName ?? 'Patient',
      patientInitials: this.generateInitials(user?.firstName, user?.lastName),
      queuePosition: waitingRoomSession.queuePosition,
      estimatedWaitTime: waitingRoomSession.estimatedWaitTime,
      joinedAt: new Date(),
      joinTime: new Date().toISOString(),
      language: preferredLanguage || participant.language || user?.country,
      playSound: this.configService.soundAlertEnabled,
      soundUrl: this.configService.soundAlertUrl,
      notification: {
        title: 'Patient Joined Waiting Room',
        message: `A patient has joined the waiting room and is now #${waitingRoomSession.queuePosition} in queue`,
        type: 'waiting_room_join',
        priority: 'high'
      }
    });

    if (consultation.ownerId) {
      this.emitToPractitioner(consultation.ownerId, 'patient_joined', {
        consultationId,
        patientId: userId,
        patientFirstName: user?.firstName ?? 'Patient',
        patientInitials: this.generateInitials(user?.firstName, user?.lastName),
        joinTime: new Date().toISOString(),
        language: preferredLanguage || participant.language || user?.country,
        message: 'Patient joined waiting room and is ready for consultation',
        origin: 'waiting_room_join',
        queuePosition: waitingRoomSession.queuePosition,
        estimatedWaitTime: waitingRoomSession.estimatedWaitTime
      });
    }

    // Send system message to patient
    await this.chatService.createMessage({
      userId: 0, // System message
      consultationId,
      content: `You have joined the waiting room. You are #${waitingRoomSession.queuePosition} in queue. Estimated wait time: ${waitingRoomSession.estimatedWaitTime} minutes.`,
      messageType: 'SYSTEM' as any,
      clientUuid: `system_${Date.now()}`
    });

    this.logger.log(`Patient ${userId} joined waiting room for consultation ${consultationId}`);

    return {
      success: true,
      waitingRoomSession
    };
  }

  /**
   * Practitioner admits patient from waiting room to live consultation
   */
  async admitPatientFromWaitingRoom(dto: AdmitFromWaitingRoomDto, practitionerId: number): Promise<{ success: boolean }> {
    const { consultationId, patientId, welcomeMessage } = dto;

    // Verify consultation and participant
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        participants: {
          where: { userId: patientId, role: UserRole.PATIENT }
        }
      }
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    const patient = consultation.participants[0];
    if (!patient) {
      throw HttpExceptionHelper.notFound('Patient not found in consultation');
    }

    if (!patient.inWaitingRoom) {
      throw HttpExceptionHelper.badRequest('Patient is not in waiting room');
    }

    // Admit patient
    await this.db.participant.update({
      where: {
        consultationId_userId: {
          consultationId,
          userId: patientId
        }
      },
      data: {
        inWaitingRoom: false,
        admittedAt: new Date(),
        admittedBy: practitionerId
      }
    });

    // Update waiting room session
    await this.db.waitingRoomSession.updateMany({
      where: {
        consultationId,
        userId: patientId,
        status: 'waiting'
      },
      data: {
        status: 'admitted',
        admittedAt: new Date()
      }
    });

    // Update consultation status to ACTIVE
    await this.db.consultation.update({
      where: { id: consultationId },
      data: {
        status: ConsultationStatus.ACTIVE,
        startedAt: new Date()
      }
    });

    // Reorder remaining waiting queue (handled by EnhancedRealtimeService)

    // Emit real-time events
    this.emitToConsultationRoom(consultationId, 'patient_admitted', {
      consultationId,
      patientId,
      practitionerId,
      admittedAt: new Date()
    });

    // Send welcome message
    const message = welcomeMessage || 'You have been admitted to the consultation. The practitioner will join shortly.';
    await this.chatService.createMessage({
      userId: 0, // System message
      consultationId,
      content: message,
      messageType: 'SYSTEM' as any,
      clientUuid: `system_${Date.now()}`
    });

    this.logger.log(`Patient ${patientId} admitted to live consultation ${consultationId} by practitioner ${practitionerId}`);

    return { success: true };
  }

  /**
   * Practitioner joins live consultation
   */
  async joinLiveConsultation(dto: LiveConsultationJoinDto): Promise<LiveConsultationDataDto> {
    const { consultationId, userId, role } = dto;

    // Verify consultation exists
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        participants: {
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
        }
      }
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    // Verify user has permission to join
    const userParticipant = consultation.participants.find(p => p.userId === userId);
    if (!userParticipant && role !== UserRole.PRACTITIONER) {
      throw HttpExceptionHelper.badRequest('User is not authorized to join this consultation');
    }

    // If practitioner joining, create participant record if doesn't exist
    if (role === UserRole.PRACTITIONER && !userParticipant) {
      await this.db.participant.create({
        data: {
          consultationId,
          userId,
          role: UserRole.PRACTITIONER,
          isActive: true,
          joinedAt: new Date(),
          lastSeenAt: new Date(),
          lastActiveAt: new Date(),
          inWaitingRoom: false
        }
      });
    } else if (userParticipant) {
      // Update existing participant
      await this.db.participant.update({
        where: {
          consultationId_userId: {
            consultationId,
            userId
          }
        },
        data: {
          isActive: true,
          joinedAt: userParticipant.joinedAt || new Date(),
          lastSeenAt: new Date(),
          lastActiveAt: new Date()
        }
      });
    }

    // Update consultation status if practitioner is joining
    if (role === UserRole.PRACTITIONER && consultation.status !== ConsultationStatus.ACTIVE) {
      await this.db.consultation.update({
        where: { id: consultationId },
        data: {
          status: ConsultationStatus.ACTIVE,
          startedAt: consultation.startedAt || new Date(),
          practitionerAdmitted: true
        }
      });
    }

    // Get updated participants
    const updatedParticipants = await this.db.participant.findMany({
      where: { consultationId, isActive: true },
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

    // Get recent messages
    const recentMessages = await this.chatService.getMessages(consultationId, 50, 0);

    // Emit real-time event
    this.emitToConsultationRoom(consultationId, 'practitioner_joined', {
      consultationId,
      practitionerId: userId,
      joinedAt: new Date(),
      participants: updatedParticipants.map(p => ({
        id: p.userId,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        role: p.user.role,
        isActive: p.isActive
      }))
    });

    // Send system message
    await this.chatService.createMessage({
      userId: 0, // System message
      consultationId,
      content: `${role.toLowerCase()} has joined the consultation.`,
      messageType: 'SYSTEM' as any,
      clientUuid: `system_${Date.now()}`
    });

    this.logger.log(`${role} ${userId} joined live consultation ${consultationId}`);

    // Transform participants to DTOs
    const participantDtos: ConsultationParticipantDto[] = updatedParticipants.map(p => ({
      id: p.user.id,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      role: p.user.role,
      isActive: p.isActive,
      joinedAt: p.joinedAt || undefined,
      lastSeenAt: p.lastSeenAt || undefined,
      language: p.language || undefined,
      connectionQuality: p.connectionQualityScore
    }));

    return {
      id: consultation.id,
      status: consultation.status,
      startedAt: consultation.startedAt || undefined,
      participants: participantDtos,
      recentMessages: recentMessages || [],
      symptoms: consultation.symptoms || undefined,
      waitingRoomEnabled: consultation.waitingRoomEnabled,
      autoAdmitPatients: consultation.autoAdmitPatients
    };
  }

  /**
   * Calculate waiting room statistics
   */
  private async calculateWaitingRoomStats(practitionerId: number): Promise<WaitingRoomStatsDto> {
    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
      select: {
        GroupMember: { select: { groupId: true } },
        specialities: { select: { specialityId: true } }
      }
    });

    if (!practitioner) {
      return { totalWaiting: 0, averageWaitTime: 0, longestWaitTime: 0 };
    }

    const practitionerGroupIds = practitioner.GroupMember.map(gm => gm.groupId);
    const practitionerSpecialityIds = practitioner.specialities.map(s => s.specialityId);

    const waitingSessions = await this.db.waitingRoomSession.findMany({
      where: {
        status: 'waiting',
        consultation: {
          status: ConsultationStatus.WAITING,
          OR: [
            { ownerId: practitionerId },
            { ownerId: null, groupId: { in: practitionerGroupIds } },
            { ownerId: null, specialityId: { in: practitionerSpecialityIds } }
          ]
        }
      }
    });

    const totalWaiting = waitingSessions.length;

    if (totalWaiting === 0) {
      return { totalWaiting: 0, averageWaitTime: 0, longestWaitTime: 0 };
    }

    const waitTimes = waitingSessions.map(session =>
      Math.floor((Date.now() - session.enteredAt.getTime()) / (1000 * 60))
    );

    const averageWaitTime = Math.floor(waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length);
    const longestWaitTime = Math.max(...waitTimes);

    return {
      totalWaiting,
      averageWaitTime,
      longestWaitTime
    };
  }

  /**
 * Enhanced waiting room state transition management
 */
  async updateWaitingRoomState(
    consultationId: number,
    userId: number,
    newState: 'waiting' | 'admitted' | 'left',
    metadata?: any
  ): Promise<void> {
    // Update waiting room session state
    await this.db.waitingRoomSession.updateMany({
      where: {
        consultationId,
        userId,
        status: { in: ['waiting', 'admitted'] }
      },
      data: {
        status: newState,
        updatedAt: new Date()
      }
    });

    // Emit real-time event for state transitions
    this.emitToConsultationRoom(consultationId, 'waiting_room_state_change', {
      consultationId,
      userId,
      previousState: 'waiting',
      newState,
      timestamp: new Date(),
      metadata
    });

    this.logger.log(`Updated waiting room state for user ${userId} in consultation ${consultationId}: ${newState}`);
  }

  /**
   * Enhanced error recovery for waiting room operations
   */
  async recoverWaitingRoomSession(consultationId: number, userId: number): Promise<{ recovered: boolean; session?: any }> {
    try {
      // Check for orphaned waiting room sessions
      const orphanedSessions = await this.db.waitingRoomSession.findMany({
        where: {
          consultationId,
          userId,
          status: 'waiting',
          createdAt: {
            lt: new Date(Date.now() - 30 * 60 * 1000) // Older than 30 minutes
          }
        }
      });

      if (orphanedSessions.length > 0) {
        // Clean up orphaned sessions
        await this.db.waitingRoomSession.updateMany({
          where: {
            id: { in: orphanedSessions.map(s => s.id) }
          },
          data: {
            status: 'timeout',
            updatedAt: new Date()
          }
        });

        // Create new session
        const newSession = await this.joinWaitingRoom({
          consultationId,
          userId,
          preferredLanguage: undefined
        });

        return { recovered: true, session: newSession.waitingRoomSession };
      }

      return { recovered: false };
    } catch (error) {
      this.logger.error(`Failed to recover waiting room session for user ${userId}:`, error);
      return { recovered: false };
    }
  }

  /**
   * Calculate estimated wait time based on queue position
   */
  private calculateEstimatedWaitTime(queuePosition: number): number {
    // Base time: 5 minutes per patient ahead + 2 minutes buffer
    const baseTime = (queuePosition - 1) * 5 + 2;
    return Math.max(baseTime, 2);
  }

  /**
   * Emit event to consultation room
   */
  private emitToConsultationRoom(consultationId: number, event: string, data: any): void {
    if (this.consultationGateway.server) {
      this.consultationGateway.server.to(`consultation:${consultationId}`).emit(event, data);
    }
  }

  /**
   * Emit event to practitioners in consultation
   */
  private emitToConsultationPractitioners(consultationId: number, event: string, data: any): void {
    if (this.consultationGateway.server) {
      this.consultationGateway.server.to(`consultation:${consultationId}`).emit(event, data);
    }
  }

  /**
   * Emit event to specific practitioner
   */
  private emitToPractitioner(practitionerId: number, event: string, data: any): void {
    if (this.consultationGateway.server) {
      this.consultationGateway.server.to(`practitioner:${practitionerId}`).emit(event, data);
    }
  }

  /**
   * Emit event to specific user
   */
  private emitToUser(userId: number, event: string, data: any): void {
    if (this.consultationGateway.server) {
      this.consultationGateway.server.to(`user-${userId}`).emit(event, data);
    }
  }

  /**
   * Generate initials from first and last name
   */
  private generateInitials(firstName?: string, lastName?: string): string {
    if (!firstName && !lastName) return 'P';
    if (!firstName) return lastName?.[0]?.toUpperCase() || 'P';
    if (!lastName) return firstName[0].toUpperCase();
    return (firstName[0] + lastName[0]).toUpperCase();
  }

  /**
   * Get waiting room sessions for a consultation (consolidated from enhanced-realtime.service.ts)
   */
  async getWaitingRoomSessions(consultationId: number): Promise<WaitingRoomSessionDto[]> {
    const sessions = await this.db.waitingRoomSession.findMany({
      where: {
        consultationId,
        status: 'waiting'
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      },
      orderBy: {
        enteredAt: 'asc'
      }
    });

    return sessions.map(session => ({
      id: session.id,
      consultationId: session.consultationId,
      userId: session.userId,
      enteredAt: session.enteredAt,
      admittedAt: session.admittedAt || undefined,
      leftAt: session.leftAt || undefined,
      estimatedWaitTime: session.estimatedWaitTime || undefined,
      queuePosition: session.queuePosition || undefined,
      status: session.status
    }));
  }

  /**
   * Get waiting room statistics (consolidated from enhanced-realtime.service.ts)
   */
  async getWaitingRoomStats(consultationId: number): Promise<RealtimeWaitingRoomStatsDto> {
    const sessions = await this.db.waitingRoomSession.findMany({
      where: {
        consultationId,
        status: 'waiting'
      }
    });

    const totalWaiting = sessions.length;
    const waitTimes = sessions.map(s =>
      Math.floor((Date.now() - s.enteredAt.getTime()) / 60000)
    );

    return {
      totalWaiting,
      averageWaitTime: waitTimes.length > 0 ? Math.floor(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0,
      longestWaitTime: waitTimes.length > 0 ? Math.max(...waitTimes) : 0
    };
  }
}
