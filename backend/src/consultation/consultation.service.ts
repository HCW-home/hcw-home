import {
  Injectable,
  Inject,
  Logger,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ConsultationStatus,
  UserRole,
  Consultation,
  UserSex,
} from '@prisma/client';
import {
  IConsultationGateway,
  CONSULTATION_GATEWAY_TOKEN,
} from './interfaces/consultation-gateway.interface';
import PDFDocument from 'pdfkit';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';
import { JoinConsultationResponseDto } from './dto/join-consultation.dto';
import { WaitingRoomPreviewResponseDto } from './dto/waiting-room-preview.dto';
import {
  AdmitPatientDto,
  AdmitPatientResponseDto,
} from './dto/admit-patient.dto';
import {
  CreateConsultationDto,
  CreateConsultationWithTimeSlotDto,
  ConsultationResponseDto,
} from './dto/create-consultation.dto';
import { ConsultationHistoryItemDto } from './dto/consultation-history-item.dto';
import { ConsultationDetailDto } from './dto/consultation-detail.dto';
import { plainToInstance } from 'class-transformer';
import {
  EndConsultationDto,
  EndConsultationResponseDto,
} from './dto/end-consultation.dto';
import { ConsultationPatientHistoryItemDto } from './dto/consultation-patient-history.dto';
import { RateConsultationDto } from './dto/rate-consultation.dto';
import { ConfigService } from 'src/config/config.service';
import { AvailabilityService } from 'src/availability/availability.service';
import { MediasoupSessionService } from 'src/mediasoup/mediasoup-session.service';
import { ReminderService } from 'src/reminder/reminder.service';
import {
  CloseConsultationResponseDto,
  OpenConsultationItemDto,
  OpenConsultationPatientDto,
  OpenConsultationResponseDto,
} from './dto/open-consultation.dto';
import { EmailService } from 'src/common/email/email.service';
import { AddParticipantDto } from './dto/add-participant.dto';
import { ConsultationInvitationService } from './consultation-invitation.service';
import { ConsultationUtilityService } from './consultation-utility.service';
import { ConsultationMediaSoupService } from './consultation-mediasoup.service';
import {
  CreatePatientConsultationDto,
  CreatePatientConsultationResponseDto,
} from './dto/invite-form.dto';
import {
  SubmitFeedbackDto,
  FeedbackResponseDto,
  FeedbackSatisfaction
} from './dto/submit-feedback.dto';

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly availabilityService: AvailabilityService,
    private readonly emailService: EmailService,
    private readonly consultationInvitationService: ConsultationInvitationService,
    private readonly consultationUtilityService: ConsultationUtilityService,
    private readonly consultationMediaSoupService: ConsultationMediaSoupService,
    private readonly mediasoupSessionService: MediasoupSessionService,
    @Inject(CONSULTATION_GATEWAY_TOKEN)
    private readonly consultationGateway: IConsultationGateway,
    private readonly reminderService: ReminderService,
  ) { }

  async addParticipantToConsultation(
    addParticipantDto: AddParticipantDto,
    userId: number,
  ): Promise<ApiResponseDto<any>> {
    const { consultationId, email, role, name, notes } = addParticipantDto;

    try {
      if (!email?.trim()) {
        throw HttpExceptionHelper.badRequest('Email is required');
      }

      const trimmedEmail = email.trim().toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        throw HttpExceptionHelper.badRequest('Invalid email format');
      }

      // Validate role
      const allowedRoles: UserRole[] = [
        UserRole.EXPERT,
        UserRole.GUEST,
        UserRole.PATIENT,
      ];
      if (!allowedRoles.includes(role)) {
        throw HttpExceptionHelper.badRequest(
          `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`,
        );
      }

      const consultation = await this.db.consultation.findUnique({
        where: { id: consultationId },
        include: {
          owner: true,
          participants: {
            include: { user: true },
          },
        },
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      const requester = await this.db.user.findUnique({
        where: { id: userId },
      });
      if (!requester) {
        throw HttpExceptionHelper.notFound('Requesting user not found');
      }

      // Enhanced authorization checks
      if (
        requester.role !== UserRole.PRACTITIONER &&
        requester.role !== UserRole.ADMIN
      ) {
        throw HttpExceptionHelper.forbidden(
          'Only practitioners and admins can add participants to a consultation',
        );
      }

      if (
        requester.role === UserRole.PRACTITIONER &&
        consultation.ownerId !== userId
      ) {
        throw HttpExceptionHelper.forbidden(
          'Only the consultation owner (practitioner) can add participants',
        );
      }

      // Check if consultation is in valid state for adding participants
      const validStatuses: ConsultationStatus[] = [
        ConsultationStatus.DRAFT,
        ConsultationStatus.SCHEDULED,
        ConsultationStatus.WAITING,
      ];
      if (!validStatuses.includes(consultation.status)) {
        throw HttpExceptionHelper.badRequest(
          `Cannot add participants to consultation in ${consultation.status} status`,
        );
      }

      // Check if participant already exists
      const existingParticipant = consultation.participants.find(
        (p) => p.user.email.toLowerCase() === trimmedEmail,
      );
      if (existingParticipant) {
        throw HttpExceptionHelper.conflict(
          'User with this email is already a participant in this consultation',
        );
      }

      // Check for pending invitations
      const existingInvitation = await this.db.consultationInvitation.findFirst(
        {
          where: {
            consultationId,
            inviteEmail: { equals: trimmedEmail, mode: 'insensitive' },
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
        },
      );

      if (existingInvitation) {
        throw HttpExceptionHelper.conflict(
          'A pending invitation already exists for this email',
        );
      }

      // Use the dedicated invitation service with enhanced security
      const invitation =
        await this.consultationInvitationService.createInvitationEmail(
          consultationId,
          userId,
          trimmedEmail,
          role,
          name?.trim(),
          notes?.trim(),
          24 * 60, // 24 hours expiration
        );

      // Create user if doesn't exist (for tracking)
      let participantUser = await this.db.user.findUnique({
        where: { email: trimmedEmail },
      });

      if (!participantUser) {
        // Create a temporary user account for tracking
        participantUser = await this.db.user.create({
          data: {
            email: trimmedEmail,
            firstName: name?.trim() || 'Invited User',
            lastName: '',
            role,
            temporaryAccount: true,
            password: await bcrypt.hash(
              crypto.randomBytes(16).toString('hex'),
              10,
            ),
          },
        });
      }

      // Create participant record
      const participant = await this.db.participant.create({
        data: {
          consultationId,
          userId: participantUser.id,
          role,
          isActive: false,
          isBeneficiary: role === UserRole.PATIENT,
        },
      });

      // Emit real-time notification
      if (this.consultationGateway.server) {
        this.consultationGateway.server
          .to(`consultation:${consultationId}`)
          .emit('participant_invited', {
            consultationId,
            participant: {
              id: participantUser.id,
              firstName: participantUser.firstName,
              lastName: participantUser.lastName,
              email: participantUser.email,
              role: participantUser.role,
              isActive: false,
              invitedAt: new Date(),
            },
            invitedBy: {
              id: requester.id,
              firstName: requester.firstName,
              lastName: requester.lastName,
            },
          });
      }

      this.logger.log(
        `Participant invited successfully - Email: ${trimmedEmail}, Role: ${role}, Consultation: ${consultationId}, By: ${userId}`,
      );

      return ApiResponseDto.success(
        {
          success: true,
          participantId: participantUser.id,
          invitationId: invitation.id,
          expiresAt: invitation.expiresAt,
        },
        'Participant invited successfully. Invitation email has been sent.',
        201,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add participant to consultation ${consultationId}: ${error.message}`,
        error.stack,
      );

      // Re-throw known HTTP exceptions
      if (error.status) {
        throw error;
      }

      // Handle unexpected errors
      throw HttpExceptionHelper.internalServerError(
        'Failed to add participant to consultation',
        undefined,
        undefined,
        error,
      );
    }
  }

  async createConsultation(
    createDto: CreateConsultationDto,
    userId: number,
  ): Promise<ApiResponseDto<ConsultationResponseDto>> {
    const creator = await this.db.user.findUnique({ where: { id: userId } });
    if (!creator) throw HttpExceptionHelper.notFound('Creator user not found');

    if (creator.role === UserRole.PATIENT) {
      if (createDto.patientId !== userId) {
        throw HttpExceptionHelper.forbidden(
          'Patients can only book consultations for themselves',
        );
      }
    } else if (
      creator.role !== UserRole.PRACTITIONER &&
      creator.role !== UserRole.ADMIN
    ) {
      throw HttpExceptionHelper.forbidden(
        'Only patients (for themselves), practitioners, or admins can create consultations',
      );
    }

    const patient = await this.db.user.findUnique({
      where: { id: createDto.patientId },
    });
    if (!patient) throw HttpExceptionHelper.notFound('Patient does not exist');
    if (patient.role !== UserRole.PATIENT)
      throw HttpExceptionHelper.badRequest('Target user is not a patient');

    const isDraft = !createDto.ownerId;

    let ownerConnect: { connect: { id: number } } | undefined;
    let status: ConsultationStatus;

    if (isDraft) {
      ownerConnect = undefined;
      status = ConsultationStatus.DRAFT;
    } else {
      const ownerId = createDto.ownerId ?? userId;
      const practitioner = await this.db.user.findUnique({
        where: { id: ownerId },
      });
      if (!practitioner || practitioner.role !== UserRole.PRACTITIONER)
        throw HttpExceptionHelper.badRequest(
          'Owner must be a valid practitioner',
        );
      ownerConnect = { connect: { id: ownerId } };
      status = ConsultationStatus.SCHEDULED;
    }

    if (!isDraft) {
      const existing = await this.db.consultation.findFirst({
        where: {
          participants: {
            some: { userId: createDto.patientId },
          },
          status: {
            in: [
              ConsultationStatus.SCHEDULED,
              ConsultationStatus.WAITING,
              ConsultationStatus.ACTIVE,
            ],
          },
        },
      });
      if (existing)
        throw HttpExceptionHelper.conflict(
          'Patient already has an active consultation',
        );
    }

    const createData: any = {
      scheduledDate: createDto.scheduledDate,
      createdBy: userId,
      status: status,
      symptoms: createDto.symptoms,
      specialityId: createDto.specialityId,
      reminderEnabled: createDto.reminderConfig?.enabled ?? true,
      participants: {
        create: {
          userId: createDto.patientId,
          isActive: false,
          isBeneficiary: true,
          role: UserRole.PATIENT,
        },
      },
      ...(typeof createDto.groupId === 'number' && {
        group: { connect: { id: createDto.groupId } },
      }),
    };

    if (ownerConnect) {
      createData.owner = ownerConnect;
    }

    // Set reminderEnabled based on the DTO if provided
    if (createDto.reminderConfig?.enabled !== undefined) {
      createData.reminderEnabled = createDto.reminderConfig.enabled;
    }

    const consultation = (await this.db.consultation.create({
      data: createData,
      include: {
        participants: true,
        owner: true,
      },
    })) as Consultation;
    // Schedule reminders if consultation has a scheduled date and reminders are enabled
    if (
      consultation.scheduledDate &&
      consultation.reminderEnabled &&
      consultation.status === ConsultationStatus.SCHEDULED
    ) {
      try {
        await this.reminderService.scheduleReminders(
          consultation.id,
          consultation.scheduledDate,
          createDto.reminderConfig?.types,
        );
      } catch (error) {
        this.logger.error(
          `Failed to schedule reminders for consultation ${consultation.id}:`,
          error,
        );
        // Continue despite reminder scheduling failure
      }
    }

    if (createDto.participants && createDto.participants.length > 0) {
      for (const participantDto of createDto.participants) {
        if (!participantDto.email) {
          throw HttpExceptionHelper.badRequest(
            'Participant must have an email.',
          );
        }

        let participantUser = await this.db.user.findUnique({
          where: { email: participantDto.email },
        });

        if (!participantUser) {
          participantUser = await this.db.user.create({
            data: {
              email: participantDto.email,
              firstName: participantDto.name,
              lastName: '',
              role: participantDto.role,
              temporaryAccount: true,
              password: crypto.randomBytes(16).toString('hex'),
            },
          });
        }

        await this.db.participant.create({
          data: {
            consultationId: consultation.id,
            userId: participantUser.id,
            role: participantDto.role,
          },
        });

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await this.db.consultationInvitation.create({
          data: {
            consultationId: consultation.id,
            invitedUserId: participantUser.id,
            inviteEmail: participantDto.email,
            name: participantDto.name,
            notes: participantDto.notes,
            role: participantDto.role,
            token,
            expiresAt,
            createdById: userId,
          },
        });

        const magicLinkUrl =
          this.consultationUtilityService.generateMagicLinkUrl(
            token,
            participantDto.role,
          );

        await this.emailService.sendConsultationInvitationEmail(
          participantDto.email,
          `${creator.firstName} ${creator.lastName}`,
          consultation.id,
          magicLinkUrl,
          participantDto.role,
          participantDto.name,
          participantDto.notes,
        );
      }
    }

    return ApiResponseDto.success(
      plainToInstance(ConsultationResponseDto, consultation),
      'Consultation created',
      201,
    );
  }

  async createPatientAndConsultation(
    createDto: CreatePatientConsultationDto,
    practitionerId: number,
  ) {
    const practitioner = await this.db.user.findFirst({
      where: {
        id: practitionerId,
        role: UserRole.PRACTITIONER,
      },
    });

    if (!practitioner) {
      throw new NotFoundException('Practitioner not found');
    }

    // Determine if contact is email or phone
    const isEmail = createDto.contact.includes('@');
    const searchCriteria = isEmail
      ? { email: createDto.contact }
      : { phoneNumber: createDto.contact };

    // Check if patient already exists
    let patient = await this.db.user.findFirst({
      where: {
        ...searchCriteria,
        role: UserRole.PATIENT,
      },
    });

    let isNewPatient = false;

    if (!patient) {
      const tempPassword = 'temp123';
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const patientData = {
        role: UserRole.PATIENT,
        firstName: createDto.firstName,
        lastName: createDto.lastName,
        sex: this.mapGenderToUserSex(createDto.gender),
        temporaryAccount: true,
        password: hashedPassword,
        ...(isEmail
          ? { email: createDto.contact }
          : {
            phoneNumber: createDto.contact,
            email: `temp_${Date.now()}@temporary.local`,
          }),
      };

      patient = await this.db.user.create({
        data: patientData,
      });

      isNewPatient = true;
    }

    const consultationData = {
      ownerId: practitionerId,
      groupId: createDto.group ? parseInt(createDto.group) : null,
      specialityId: createDto.specialityId || null,
      symptoms: createDto.symptoms || null,
      scheduledDate: createDto.scheduledDate || null,
      status: ConsultationStatus.SCHEDULED,
      createdAt: new Date(),
      startedAt: new Date(),
    };

    const consultation = await this.db.consultation.create({
      data: consultationData,
    });

    await this.db.participant.create({
      data: {
        consultationId: consultation.id,
        userId: patient.id,
        role: UserRole.PATIENT,
        isBeneficiary: true,
        language: createDto.language,
        inWaitingRoom: true,
      },
    });

    await this.db.participant.create({
      data: {
        consultationId: consultation.id,
        userId: practitionerId,
        role: UserRole.PRACTITIONER,
        isBeneficiary: false,
        inWaitingRoom: false,
      },
    });

    const response: CreatePatientConsultationResponseDto = {
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phoneNumber: patient.phoneNumber ?? undefined,
        isNewPatient,
      },
      consultation: {
        id: consultation.id,
        status: consultation.status,
        ownerId: consultation.ownerId!,
        scheduledDate: consultation.scheduledDate
          ? new Date(consultation.scheduledDate)
          : undefined,
      },
    };

    return {
      data: response,
      message: isNewPatient
        ? 'Patient created and consultation scheduled successfully'
        : 'Consultation scheduled for existing patient successfully',
      statusCode: HttpStatus.CREATED,
    };
  }

  private mapGenderToUserSex(gender: string): UserSex {
    switch (gender.toLowerCase()) {
      case 'male':
        return UserSex.MALE;
      case 'female':
        return UserSex.FEMALE;
      default:
        return UserSex.OTHER;
    }
  }

  async createConsultationWithTimeSlot(
    createDto: CreateConsultationWithTimeSlotDto,
    userId: number,
  ): Promise<ApiResponseDto<ConsultationResponseDto>> {
    const { timeSlotId, ...consultationData } = createDto;

    const timeSlot = await this.db.timeSlot.findUnique({
      where: { id: timeSlotId },
    });

    if (!timeSlot) {
      throw HttpExceptionHelper.notFound('Time slot not found');
    }

    if (timeSlot.status !== 'AVAILABLE') {
      throw HttpExceptionHelper.badRequest('Time slot is not available');
    }

    const scheduledDateTime = new Date(timeSlot.date);
    const [hours, minutes] = timeSlot.startTime.split(':').map(Number);
    scheduledDateTime.setHours(hours, minutes, 0, 0);

    const consultationDataWithOwner = {
      ...consultationData,
      scheduledDate: scheduledDateTime,
      ownerId: timeSlot.practitionerId,
    };

    const consultationResult = await this.createConsultation(
      consultationDataWithOwner,
      userId,
    );

    if (consultationResult.success && consultationResult.data) {
      await this.availabilityService.bookTimeSlot(
        timeSlotId,
        consultationResult.data.id,
      );
    }

    return consultationResult;
  }

  async joinAsPatient(
    consultationId: number,
    patientId: number,
  ): Promise<ApiResponseDto<JoinConsultationResponseDto>> {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        participants: { include: { user: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      } as any,
    });
    if (!consultation)
      throw HttpExceptionHelper.notFound('Consultation not found');

    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw HttpExceptionHelper.badRequest(
        'Cannot join completed consultation',
      );
    }

    const patient = await this.db.user.findUnique({ where: { id: patientId } });
    if (!patient) throw HttpExceptionHelper.notFound('Patient does not exist');
    if (patient.role !== UserRole.PATIENT)
      throw HttpExceptionHelper.badRequest('User is not a patient');

    const isAssigned = await this.db.participant.findUnique({
      where: { consultationId_userId: { consultationId, userId: patientId } },
    });
    if (!isAssigned)
      throw HttpExceptionHelper.forbidden(
        'Patient is not assigned to this consultation',
      );

    const activeConsultation = await this.db.consultation.findFirst({
      where: {
        id: { not: consultationId },
        participants: {
          some: { userId: patientId, isActive: true },
        },
        status: {
          in: [
            ConsultationStatus.SCHEDULED,
            ConsultationStatus.WAITING,
            ConsultationStatus.ACTIVE,
          ],
        },
      },
    });
    if (activeConsultation)
      throw HttpExceptionHelper.conflict(
        'Patient is already active in another consultation',
      );

    await this.db.participant.update({
      where: { consultationId_userId: { consultationId, userId: patientId } },
      data: { isActive: true, joinedAt: new Date() },
    });

    if (consultation.status === ConsultationStatus.SCHEDULED) {
      await this.db.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.WAITING },
      });
      consultation.status = ConsultationStatus.WAITING;
    }

    // Enhanced MediaSoup session handling with proper participant management
    try {
      await this.consultationMediaSoupService.handleParticipantJoinMedia(
        consultationId,
        patientId,
        UserRole.PATIENT,
      );
    } catch (mediaErr) {
      this.logger.error(
        `Enhanced MediaSoup setup failed for consultation ${consultationId}: ${mediaErr.message}`,
        mediaErr.stack,
      );
      throw HttpExceptionHelper.internalServerError(
        'Failed to setup media session for consultation',
        undefined, // requestId
        undefined, // path
        mediaErr, // error
      );
    }

    if (consultation.ownerId && this.consultationGateway.server) {
      this.consultationGateway.server
        .to(`practitioner:${consultation.ownerId}`)
        .emit('patient_waiting', {
          consultationId,
          patientFirstName: patient.firstName ?? 'Patient',
          joinTime: new Date(),
          language: patient.country ?? null,
        });
    }

    // MediaSoup session events are now handled by the enhanced participant join method above

    // Emit patient joined event to practitioner and other participants
    if (this.consultationGateway.server) {
      const patient = await this.db.user.findUnique({
        where: { id: patientId },
        select: { id: true, firstName: true, lastName: true, role: true },
      });

      this.consultationUtilityService.emitConsultationStateChange(
        consultationId,
        'patient_joined_waiting_room',
        {
          patient: {
            id: patient?.id,
            name: `${patient?.firstName} ${patient?.lastName}`,
            role: patient?.role,
            joinedAt: new Date().toISOString(),
          },
          message: 'Patient has joined the waiting room',
        },
      );
    }

    const patientCapabilities =
      this.consultationUtilityService.getConsultationCapabilities(
        UserRole.PATIENT,
        true,
      );

    const responsePayload: JoinConsultationResponseDto = {
      success: true,
      statusCode: 200,
      message: 'Patient joined consultation and entered waiting room.',
      consultationId,
      mediasoup: { routerId: consultationId, active: true },
      sessionUrl: this.consultationUtilityService.generateSessionUrl(
        consultationId,
        UserRole.PATIENT,
        true,
      ),
      redirectTo: 'waiting-room',
      status: consultation.status,
      features: patientCapabilities.features,
      mediaConfig: patientCapabilities.mediaConfig,
      participants: consultation.participants.map((p) => ({
        id: p.user.id,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        role: p.user.role,
        isActive: p.isActive,
      })),
      messages: (consultation.messages ?? []).map((m) => ({
        id: m.id,
        userId: m.userId,
        content: m.content,
        mediaUrl: m.mediaUrl ?? null,
        mediaType: m.mediaType ?? null,
        createdAt: m.createdAt,
      })),
    };

    return ApiResponseDto.success(
      responsePayload,
      responsePayload.message,
      responsePayload.statusCode,
    );
  }

  /**
   * Smart Patient Join - Handles intelligent patient joining logic
   *
   * Flow Logic:
   * 1. Magic Link (first time) → Always go to waiting room
   * 2. Dashboard Join → Check if patient was previously admitted
   *    - If consultation is ACTIVE and patient was admitted before → Direct to consultation room
   *    - If consultation is WAITING or patient never admitted → Go to waiting room
   * 3. Readmission → Patient returning after disconnection from active consultation
   */
  async smartPatientJoin(
    consultationId: number,
    patientId: number,
    joinType: 'magic-link' | 'dashboard' | 'readmission',
  ): Promise<ApiResponseDto<JoinConsultationResponseDto>> {
    try {
      // Get consultation with full context
      const consultation = await this.db.consultation.findUnique({
        where: { id: consultationId },
        include: {
          participants: {
            include: { user: true },
            where: { userId: patientId },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50,
          },
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      if (consultation.status === ConsultationStatus.COMPLETED) {
        throw HttpExceptionHelper.badRequest(
          'Cannot join completed consultation',
        );
      }

      // Get patient info
      const patient = await this.db.user.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          email: true,
        },
      });

      if (!patient || patient.role !== UserRole.PATIENT) {
        throw HttpExceptionHelper.badRequest('User is not a patient');
      }

      // Get patient's participation history
      const participant = consultation.participants[0];
      if (!participant) {
        throw HttpExceptionHelper.forbidden(
          'Patient is not assigned to this consultation',
        );
      }

      // Check if patient is in another active consultation
      const activeConsultation = await this.db.consultation.findFirst({
        where: {
          id: { not: consultationId },
          participants: {
            some: { userId: patientId, isActive: true },
          },
          status: {
            in: [ConsultationStatus.WAITING, ConsultationStatus.ACTIVE],
          },
        },
      });

      if (activeConsultation) {
        throw HttpExceptionHelper.conflict(
          'Patient is already active in another consultation',
        );
      }

      // Production-Grade Transition Logic with Config Service URLs
      let redirectTo: 'waiting-room' | 'consultation-room';
      let inWaitingRoom: boolean;
      let message: string;
      let websocketEvent: string;
      let consultationUrls: any;
      let participantUpdateData: any = {
        isActive: true,
        joinedAt: new Date(),
        lastActiveAt: new Date(),
      };

      // Generate all consultation URLs using config service
      consultationUrls = this.configService.generateConsultationUrls(
        consultationId,
        UserRole.PATIENT,
      );

      // Determine transition based on join type and current state
      switch (joinType) {
        case 'magic-link':
          // First time joining via invitation - always go to waiting room
          redirectTo = 'waiting-room';
          inWaitingRoom = true;
          message = 'Patient joined via invitation link and is in waiting room';
          websocketEvent = 'patient_joined_waiting_room';
          participantUpdateData.inWaitingRoom = true;

          // Update consultation status if needed
          if (consultation.status === ConsultationStatus.SCHEDULED) {
            await this.db.consultation.update({
              where: { id: consultationId },
              data: { status: ConsultationStatus.WAITING },
            });
            consultation.status = ConsultationStatus.WAITING;
          }
          break;

        case 'dashboard':
          // Patient rejoining from dashboard - check previous admission status
          if (
            consultation.status === ConsultationStatus.ACTIVE &&
            participant.joinedAt && // Patient was previously admitted
            !participant.inWaitingRoom // And was not in waiting room last time
          ) {
            // Patient was previously admitted and consultation is active - direct join
            redirectTo = 'consultation-room';
            inWaitingRoom = false;
            message = 'Patient rejoined active consultation directly';
            websocketEvent = 'patient_rejoined_consultation';
            participantUpdateData.inWaitingRoom = false;
          } else {
            // Patient needs to wait for admission
            redirectTo = 'waiting-room';
            inWaitingRoom = true;
            message = 'Patient rejoined and is waiting for admission';
            websocketEvent = 'patient_returned_waiting_room';
            participantUpdateData.inWaitingRoom = true;

            // Update consultation status if needed
            if (consultation.status === ConsultationStatus.SCHEDULED) {
              await this.db.consultation.update({
                where: { id: consultationId },
                data: { status: ConsultationStatus.WAITING },
              });
              consultation.status = ConsultationStatus.WAITING;
            }
          }
          break;

        case 'readmission':
          // Patient returning after disconnection from active consultation
          if (
            consultation.status === ConsultationStatus.ACTIVE &&
            participant.joinedAt // Patient was previously in consultation
          ) {
            redirectTo = 'consultation-room';
            inWaitingRoom = false;
            message = 'Patient returned to active consultation';
            websocketEvent = 'patient_readmitted_consultation';
            participantUpdateData.inWaitingRoom = false;
          } else {
            redirectTo = 'waiting-room';
            inWaitingRoom = true;
            message = 'Patient returned and is waiting for consultation to resume';
            websocketEvent = 'patient_waiting_for_resume';
            participantUpdateData.inWaitingRoom = true;
          }
          break;

        default:
          throw HttpExceptionHelper.badRequest('Invalid join type');
      }

      // Get final URLs based on destination
      const finalSessionUrl = inWaitingRoom
        ? consultationUrls.patient.waitingRoom
        : consultationUrls.patient.consultationRoom;
      const finalFrontendRoute = finalSessionUrl; // Same as session URL for direct navigation

      // Update participant status
      await this.db.participant.update({
        where: { consultationId_userId: { consultationId, userId: patientId } },
        data: participantUpdateData,
      });

      // Setup MediaSoup session if needed
      try {
        await this.consultationMediaSoupService.handleParticipantJoinMedia(
          consultationId,
          patientId,
          UserRole.PATIENT,
        );
      } catch (mediaErr) {
        this.logger.error(
          `MediaSoup setup failed for smart patient join: ${mediaErr.message}`,
          mediaErr.stack,
        );
        // Don't fail the join for media errors, just log them
      }

      // Emit production-grade WebSocket events with proper URLs
      if (this.consultationGateway.server) {
        const eventData = {
          consultationId,
          patient: {
            id: patient.id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
            joinType,
          },
          transition: {
            from: participant.inWaitingRoom ? 'waiting-room' : 'consultation-room',
            to: redirectTo,
            sessionUrl: finalSessionUrl,
            frontendRoute: finalFrontendRoute,
            timestamp: new Date().toISOString(),
            message,
          },
          urls: consultationUrls,
          navigation: {
            redirectTo,
            inWaitingRoom,
            autoRedirect: true,
            requiresPractitionerAction: inWaitingRoom,
            sessionTimeout: this.configService.sessionTimeoutMs,
          },
          consultation: {
            id: consultationId,
            status: consultation.status,
            ownerId: consultation.ownerId,
            ownerName: consultation.owner ?
              `${consultation.owner.firstName} ${consultation.owner.lastName}` :
              'Unknown Practitioner',
          },
          mediasoup: {
            ready: true,
            namespace: consultationUrls.websocket.mediasoup,
          },
          session: {
            timeout: this.configService.sessionTimeoutMs,
            canRejoin: true,
            timestamp: new Date().toISOString(),
          },
        };

        // Notify practitioner with comprehensive action data
        if (consultation.ownerId) {
          this.consultationGateway.server
            .to(`practitioner:${consultation.ownerId}`)
            .emit(websocketEvent, {
              ...eventData,
              practitioner: {
                actionRequired: inWaitingRoom,
                message: inWaitingRoom
                  ? 'Patient is waiting for admission'
                  : 'Patient has joined the consultation',
                dashboardUrl: consultationUrls.practitioner.dashboard,
                patientManagementUrl: consultationUrls.practitioner.patientManagement,
              },
            });
        }

        // Notify all participants in consultation
        this.consultationGateway.server
          .to(`consultation:${consultationId}`)
          .emit('patient_status_update', {
            ...eventData,
            timestamp: new Date().toISOString(),
          });

        // Emit specific navigation events for seamless transitions
        if (redirectTo === 'waiting-room') {
          this.consultationGateway.server
            .to(`consultation:${consultationId}`)
            .emit('patient_in_waiting_room', {
              ...eventData,
              waitingRoom: {
                practitionerId: consultation.ownerId,
                practitionerName: eventData.consultation.ownerName,
                estimatedWaitTime: '2-5 minutes',
                canLeave: true,
                leaveUrl: consultationUrls.patient.dashboard,
              },
            });

          // Send frontend navigation command to patient
          this.consultationGateway.server
            .to(`patient:${patientId}`)
            .emit('navigate_to_waiting_room', {
              url: finalFrontendRoute,
              sessionUrl: finalSessionUrl,
              autoRedirect: true,
              message: 'You are in the waiting room. The practitioner will admit you shortly.',
            });
        } else {
          this.consultationGateway.server
            .to(`consultation:${consultationId}`)
            .emit('patient_joined_consultation_room', {
              ...eventData,
              consultationRoom: {
                mediaEnabled: true,
                chatEnabled: true,
                participantCount: consultation.participants?.length || 1,
                practitionerPresent: !!consultation.ownerId,
              },
            });

          // Send frontend navigation command to patient
          this.consultationGateway.server
            .to(`patient:${patientId}`)
            .emit('navigate_to_consultation_room', {
              url: finalFrontendRoute,
              sessionUrl: finalSessionUrl,
              autoRedirect: true,
              message: 'You are being redirected to the consultation room.',
            });
        }

        // Additional real-time synchronization events
        this.consultationGateway.server
          .to(`consultation:${consultationId}`)
          .emit('consultation_participant_update', {
            consultationId,
            participantCount: consultation.participants?.length || 0,
            timestamp: new Date().toISOString(),
          });
      }

      // Get consultation capabilities
      const patientCapabilities =
        this.consultationUtilityService.getConsultationCapabilities(
          UserRole.PATIENT,
          inWaitingRoom,
        );

      // Build comprehensive response with enhanced session URLs and navigation
      const responsePayload: JoinConsultationResponseDto = {
        success: true,
        statusCode: 200,
        message,
        consultationId,
        mediasoup: {
          routerId: consultationId,
          active: true,
        },
        sessionUrl: finalSessionUrl,
        redirectTo,
        status: consultation.status,
        features: patientCapabilities.features,
        mediaConfig: patientCapabilities.mediaConfig,
        waitingRoom: inWaitingRoom
          ? {
            practitionerId: consultation.ownerId || 0,
            practitionerName: consultation.owner
              ? `${consultation.owner.firstName} ${consultation.owner.lastName}`.trim()
              : 'Practitioner',
            estimatedWaitTime: '5-10 minutes',
          }
          : undefined,
        participants: consultation.participants.map((p) => ({
          id: p.user.id,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          role: p.user.role,
          isActive: p.isActive,
        })),
        messages: consultation.messages.map((m) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          mediaUrl: m.mediaUrl ?? null,
          mediaType: m.mediaType ?? null,
          createdAt: m.createdAt,
        })),
      };

      this.logger.log(
        `Smart patient join: Patient ${patientId}, JoinType: ${joinType}, Destination: ${redirectTo}, Consultation: ${consultationId}`,
      );

      // Additional navigation and session information is sent via WebSocket events:
      // - navigate_to_waiting_room / navigate_to_consultation_room (for frontend routing)
      // - patient_status_update (with real-time state information)
      // - Frontend can use check_session_status WebSocket event for reconnection logic

      return ApiResponseDto.success(
        responsePayload,
        responsePayload.message,
        responsePayload.statusCode,
      );
    } catch (error) {
      this.logger.error(
        `Smart patient join failed: Patient ${patientId}, JoinType: ${joinType}, Consultation: ${consultationId}`,
        error.stack,
      );

      // Re-throw known HTTP exceptions
      if (error.status) {
        throw error;
      }

      throw HttpExceptionHelper.internalServerError(
        'Failed to join consultation',
        undefined,
        undefined,
        error,
      );
    }
  }

  async joinAsPractitioner(
    consultationId: number,
    practitionerId: number,
  ): Promise<ApiResponseDto<JoinConsultationResponseDto>> {
    try {
      const consultation = await this.db.consultation.findUnique({
        where: { id: consultationId },
        include: {
          participants: { include: { user: true } },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      const practitioner = await this.db.user.findUnique({
        where: { id: practitionerId },
      });

      if (!practitioner) {
        throw HttpExceptionHelper.notFound('Practitioner does not exist');
      }

      if (consultation.ownerId !== practitionerId) {
        throw HttpExceptionHelper.forbidden(
          'Not the practitioner for this consultation',
        );
      }

      if (consultation.status === ConsultationStatus.COMPLETED) {
        throw HttpExceptionHelper.badRequest(
          'Cannot join completed consultation',
        );
      }

      const participantData = {
        consultationId,
        userId: practitionerId,
        isActive: true,
        joinedAt: new Date(),
        role: UserRole.PRACTITIONER,
      };

      await this.db.participant.upsert({
        where: {
          consultationId_userId: { consultationId, userId: practitionerId },
        },
        create: participantData,
        update: { isActive: true, joinedAt: new Date() },
      });

      if (consultation.status !== ConsultationStatus.ACTIVE) {
        await this.db.consultation.update({
          where: { id: consultationId },
          data: { status: ConsultationStatus.ACTIVE },
        });
        consultation.status = ConsultationStatus.ACTIVE;
      }
      let routerCreated = false;
      try {
        let mediasoupRouter =
          this.mediasoupSessionService.getRouter(consultationId);
        if (!mediasoupRouter) {
          mediasoupRouter =
            await this.mediasoupSessionService.createRouterForConsultation(
              consultationId,
            );
          routerCreated = true;
          this.logger.log(
            `Mediasoup router created for consultation ${consultationId} (practitioner join)`,
          );
        }
      } catch (mediaErr) {
        this.logger.error(
          `Mediasoup router setup failed for consultation ${consultationId}: ${mediaErr.message}`,
          mediaErr.stack,
        );
        throw HttpExceptionHelper.internalServerError(
          'Failed to setup media session for consultation',
          undefined, // requestId
          undefined, // path
          mediaErr, // error
        );
      }

      if (this.consultationGateway.server) {
        this.consultationGateway.server
          .to(`consultation:${consultationId}`)
          .emit('practitioner_joined', {
            practitionerId,
            consultationId,
            message: 'Practitioner has joined the consultation',
          });
      }

      if (routerCreated && this.consultationGateway.server) {
        this.consultationGateway.server
          .to(`consultation:${consultationId}`)
          .emit('media_session_live', { consultationId });
      }

      const practitionerCapabilities =
        this.consultationUtilityService.getConsultationCapabilities(
          UserRole.PRACTITIONER,
        );

      const responsePayload: JoinConsultationResponseDto = {
        success: true,
        statusCode: 200,
        message: 'Practitioner joined and activated the consultation.',
        consultationId,
        mediasoup: { routerId: consultationId, active: true },
        sessionUrl: this.consultationUtilityService.generateSessionUrl(
          consultationId,
          UserRole.PRACTITIONER,
        ),
        redirectTo: 'consultation-room',
        status: consultation.status,
        features: practitionerCapabilities.features,
        mediaConfig: practitionerCapabilities.mediaConfig,
        participants: consultation.participants.map((p) => ({
          id: p.user.id,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          role: p.user.role,
          isActive: p.isActive,
        })),
        messages: (consultation.messages ?? []).map((m) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          mediaUrl: m.mediaUrl ?? null,
          mediaType: m.mediaType ?? null,
          createdAt: m.createdAt,
        })),
      };

      this.logger.log(
        `Practitioner ${practitionerId} joined consultation ${consultationId}`,
      );

      return ApiResponseDto.success(
        responsePayload,
        responsePayload.message,
        responsePayload.statusCode,
      );
    } catch (error) {
      throw error;
    }
  }

  async joinConsultationByToken(
    token: string,
    userId?: number,
  ): Promise<ApiResponseDto<JoinConsultationResponseDto>> {
    try {
      // Validate token and get invitation details using the dedicated service
      const invitation =
        await this.consultationInvitationService.validateToken(token);

      const consultation = await this.db.consultation.findUnique({
        where: { id: invitation.consultationId },
        include: {
          participants: { include: { user: true } },
          messages: { orderBy: { createdAt: 'asc' } },
          owner: true,
        },
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      if (consultation.status === ConsultationStatus.COMPLETED) {
        throw HttpExceptionHelper.badRequest(
          'Cannot join completed consultation',
        );
      }

      let user: any;
      let isNewUser = false;

      if (userId) {
        // User is already authenticated
        user = await this.db.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw HttpExceptionHelper.notFound('User not found');
        }

        // Verify user email matches invitation
        if (user.email.toLowerCase() !== invitation.inviteEmail.toLowerCase()) {
          throw HttpExceptionHelper.forbidden(
            'User email does not match invitation email',
          );
        }
      } else {
        // User joining via magic link without being authenticated
        user = await this.db.user.findUnique({
          where: { email: invitation.inviteEmail },
        });

        if (!user) {
          // Create a temporary user account with enhanced security
          const hashedPassword = await bcrypt.hash(
            crypto.randomBytes(16).toString('hex'),
            12,
          );

          user = await this.db.user.create({
            data: {
              email: invitation.inviteEmail,
              firstName: invitation.name || 'Guest',
              lastName: '',
              role: invitation.role,
              temporaryAccount: true,
              password: hashedPassword,
            },
          });
          isNewUser = true;
        }
      }

      // Check if user is already a participant
      let participant = await this.db.participant.findUnique({
        where: {
          consultationId_userId: {
            consultationId: consultation.id,
            userId: user.id,
          },
        },
      });

      if (!participant) {
        // Add user as participant based on role
        const participantData = {
          consultationId: consultation.id,
          userId: user.id,
          role: invitation.role,
          joinedAt: new Date(),
          isBeneficiary: invitation.role === UserRole.PATIENT,
          // Only patients go to waiting room initially, others join directly active
          isActive: invitation.role !== UserRole.PATIENT,
          inWaitingRoom: invitation.role === UserRole.PATIENT,
        };

        participant = await this.db.participant.create({
          data: participantData,
        });
      } else {
        // Update existing participant based on role
        const updateData: any = {
          joinedAt: new Date(),
        };

        if (invitation.role === UserRole.PATIENT) {
          // Patients join waiting room first
          updateData.isActive = true;
          updateData.inWaitingRoom = true;
        } else {
          // Experts and guests join directly active
          updateData.isActive = true;
          updateData.inWaitingRoom = false;
        }

        participant = await this.db.participant.update({
          where: {
            consultationId_userId: {
              consultationId: consultation.id,
              userId: user.id,
            },
          },
          data: updateData,
        });
      }

      // Mark invitation as used using the service
      await this.consultationInvitationService.markUsed(token, user.id);

      // Update consultation status based on participant role
      if (consultation.status === ConsultationStatus.SCHEDULED) {
        if (invitation.role === UserRole.PATIENT) {
          await this.db.consultation.update({
            where: { id: consultation.id },
            data: { status: ConsultationStatus.WAITING },
          });
          consultation.status = ConsultationStatus.WAITING;

          // Set patient in waiting room
          await this.db.participant.update({
            where: {
              consultationId_userId: {
                consultationId: consultation.id,
                userId: user.id,
              },
            },
            data: {
              inWaitingRoom: true,
            },
          });
        }
      }

      // Initialize mediasoup router if needed
      let routerCreated = false;
      try {
        let mediasoupRouter = this.mediasoupSessionService.getRouter(
          consultation.id,
        );
        if (!mediasoupRouter) {
          mediasoupRouter =
            await this.mediasoupSessionService.createRouterForConsultation(
              consultation.id,
            );
          routerCreated = true;
          this.logger.log(
            `Mediasoup router created for consultation ${consultation.id} (token join)`,
          );
        }
      } catch (mediaErr) {
        this.logger.error(
          `Mediasoup router setup failed for consultation ${consultation.id}: ${mediaErr.message}`,
          mediaErr.stack,
        );
        throw HttpExceptionHelper.internalServerError(
          'Failed to setup media session for consultation',
          undefined,
          undefined,
          mediaErr,
        );
      }

      // Enhanced WebSocket events with detailed information
      if (this.consultationGateway.server) {
        this.consultationGateway.server
          .to(`consultation:${consultation.id}`)
          .emit('participant_joined_via_invitation', {
            consultationId: consultation.id,
            participant: {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
              isActive: true,
              joinedVia: 'invitation',
            },
            isNewUser,
            joinedAt: new Date(),
          });

        if (routerCreated) {
          this.consultationGateway.server
            .to(`consultation:${consultation.id}`)
            .emit('media_session_ready', {
              consultationId: consultation.id,
              routerId: consultation.id,
            });
        }

        // Enhanced role-based notifications
        if (invitation.role === UserRole.PATIENT && consultation.ownerId) {
          this.consultationGateway.server
            .to(`practitioner:${consultation.ownerId}`)
            .emit('patient_joined_via_invitation', {
              consultationId: consultation.id,
              patient: {
                id: user.id,
                firstName: user.firstName ?? 'Patient',
                lastName: user.lastName ?? '',
                email: user.email,
              },
              joinTime: new Date(),
              waitingRoomStatus: 'waiting_for_admission',
              redirectTo: 'waiting-room',
              message:
                'Patient joined via invitation and is waiting for admission',
            });

          this.consultationGateway.server
            .to(`consultation:${consultation.id}`)
            .emit('patient_in_waiting_room', {
              consultationId: consultation.id,
              patient: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                joinTime: new Date(),
              },
              estimatedWaitTime: '5-10 minutes',
            });
        } else if (
          (invitation.role === UserRole.EXPERT ||
            invitation.role === UserRole.GUEST) &&
          consultation.ownerId
        ) {
          this.consultationGateway.server
            .to(`practitioner:${consultation.ownerId}`)
            .emit('expert_guest_joined_consultation', {
              consultationId: consultation.id,
              participant: {
                id: user.id,
                name: user.firstName ?? 'Participant',
                role: invitation.role,
                email: user.email,
              },
              joinTime: new Date(),
              redirectTo: 'consultation-room',
              message: `${invitation.role.toLowerCase()} joined via invitation and is ready for consultation`,
              capabilities: ['chat', 'voice', 'video'],
            });

          this.consultationGateway.server
            .to(`consultation:${consultation.id}`)
            .emit('participant_ready_for_consultation', {
              consultationId: consultation.id,
              participant: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                role: invitation.role,
                joinTime: new Date(),
              },
              features: ['chat', 'voice', 'video'],
            });
        }
      }

      // Enhanced response with comprehensive information
      const isWaitingRoom = invitation.role === UserRole.PATIENT;
      const capabilities =
        this.consultationUtilityService.getConsultationCapabilities(
          invitation.role,
          isWaitingRoom,
        );

      const responsePayload: JoinConsultationResponseDto = {
        success: true,
        statusCode: 200,
        message: `Successfully joined consultation as ${invitation.role.toLowerCase()} via invitation`,
        consultationId: consultation.id,
        mediasoup: { routerId: consultation.id, active: true },
        status: consultation.status,
        sessionUrl:
          invitation.role === UserRole.PATIENT
            ? this.consultationUtilityService.generateSessionUrl(
              consultation.id,
              invitation.role,
              true,
            )
            : this.consultationUtilityService.generateSessionUrl(
              consultation.id,
              invitation.role,
            ),
        redirectTo:
          invitation.role === UserRole.PATIENT
            ? 'waiting-room'
            : 'consultation-room',
        features: capabilities.features,
        mediaConfig: capabilities.mediaConfig,
        waitingRoom:
          invitation.role === UserRole.PATIENT && consultation.ownerId
            ? {
              practitionerId: consultation.ownerId,
              practitionerName:
                consultation.owner?.firstName +
                ' ' +
                (consultation.owner?.lastName || '') ||
                consultation.participants.find(
                  (p) => p.user.id === consultation.ownerId,
                )?.user.firstName ||
                'Practitioner',
              estimatedWaitTime: '5-10 minutes',
            }
            : undefined,
        participants: consultation.participants.map((p) => ({
          id: p.user.id,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          role: p.user.role,
          isActive: p.isActive,
        })),
        messages: (consultation.messages ?? []).map((m) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          mediaUrl: m.mediaUrl ?? null,
          mediaType: m.mediaType ?? null,
          createdAt: m.createdAt,
        })),
      };

      // Emit WebSocket events based on user role
      if (this.consultationGateway.server) {
        if (
          invitation.role === UserRole.EXPERT ||
          invitation.role === UserRole.GUEST
        ) {
          // Expert/Guest joining consultation room directly
          this.consultationUtilityService.emitConsultationStateChange(
            consultation.id,
            'participant_joined_consultation',
            {
              participant: {
                id: user.id,
                name: `${user.firstName} ${user.lastName}`,
                role: invitation.role,
                email: user.email,
                joinedAt: new Date().toISOString(),
              },
              message: `${invitation.role.toLowerCase()} has joined the consultation`,
            },
          );

          // Ensure media session is ready
          await this.consultationUtilityService.ensureMediaSessionForConsultation(
            consultation.id,
          );
        } else if (invitation.role === UserRole.PATIENT) {
          // Patient joining waiting room
          this.consultationUtilityService.emitConsultationStateChange(
            consultation.id,
            'patient_joined_waiting_room',
            {
              patient: {
                id: user.id,
                name: `${user.firstName} ${user.lastName}`,
                role: invitation.role,
                joinedAt: new Date().toISOString(),
              },
              message: 'Patient has joined the waiting room via invitation',
            },
          );
        }
      }

      this.logger.log(
        `User ${user.id} (${user.email}) successfully joined consultation ${consultation.id} via invitation token as ${invitation.role}`,
      );

      return ApiResponseDto.success(
        responsePayload,
        responsePayload.message,
        responsePayload.statusCode,
      );
    } catch (error) {
      this.logger.error(
        `Failed to join consultation by token: ${error.message}`,
        error.stack,
      );

      // Re-throw known HTTP exceptions
      if (error.status) {
        throw error;
      }

      throw HttpExceptionHelper.internalServerError(
        'Failed to join consultation via invitation',
        undefined,
        undefined,
        error,
      );
    }
  }

  async admitPatient(
    dto: AdmitPatientDto,
    userId: number,
  ): Promise<ApiResponseDto<AdmitPatientResponseDto>> {
    const consultation = await this.db.consultation.findUnique({
      where: { id: dto.consultationId },
      select: { id: true, ownerId: true, version: true, status: true },
    });
    if (!consultation)
      throw HttpExceptionHelper.notFound('Consultation not found');

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw HttpExceptionHelper.notFound('User not found');

    if (user.role !== UserRole.PRACTITIONER && user.role !== UserRole.ADMIN) {
      throw HttpExceptionHelper.forbidden(
        'Only practitioners or admins can admit patients',
      );
    }

    if (consultation.ownerId !== userId && user.role !== UserRole.ADMIN) {
      throw HttpExceptionHelper.forbidden(
        'Not authorized to admit patient to this consultation',
      );
    }

    if (consultation.status !== ConsultationStatus.WAITING) {
      throw HttpExceptionHelper.badRequest(
        'Consultation is not in waiting state',
      );
    }

    try {
      // Update consultation status and move patients out of waiting room
      await this.db.consultation.update({
        where: { id: dto.consultationId },
        data: {
          status: ConsultationStatus.ACTIVE,
          version: consultation.version + 1,
        },
      });

      await this.db.participant.updateMany({
        where: {
          consultationId: dto.consultationId,
          inWaitingRoom: true,
        },
        data: {
          inWaitingRoom: false,
        },
      });

      // Enhanced MediaSoup session handling with state transition
      try {
        await this.consultationMediaSoupService.transitionConsultationState(
          dto.consultationId,
          ConsultationStatus.ACTIVE,
          user.id,
        );
      } catch (mediaErr) {
        this.logger.error(
          `Enhanced MediaSoup setup failed during admitPatient for consultation ${dto.consultationId}: ${mediaErr.message}`,
          mediaErr.stack,
        );
        throw HttpExceptionHelper.internalServerError(
          'Failed to setup media session for consultation',
          undefined,
          undefined,
          mediaErr,
        );
      }

      if (this.consultationGateway.server) {
        try {
          this.consultationGateway.server
            .to(`consultation:${dto.consultationId}`)
            .emit('consultation_status', {
              status: 'ACTIVE',
              initiatedBy: user.role,
            });

          // Emit patient admission with redirection info
          this.consultationGateway.server
            .to(`consultation:${dto.consultationId}`)
            .emit('patient_admitted_to_consultation', {
              consultationId: dto.consultationId,
              message:
                'Patient has been admitted - redirecting to consultation room',
              redirectTo: 'consultation-room',
              capabilities: ['chat', 'voice', 'video', 'screen-share'],
              timestamp: new Date(),
            });

          // Notify all participants to redirect to consultation room
          this.consultationGateway.server
            .to(`consultation:${dto.consultationId}`)
            .emit('redirect_to_consultation_room', {
              consultationId: dto.consultationId,
              message: 'Consultation is now active - all participants can join',
              features: {
                chat: true,
                voice: true,
                video: true,
                screenShare: true,
              },
            });

          // Enhanced MediaSoup integration handles session events automatically
          // through transitionConsultationState method
        } catch (socketError) {
          this.logger.error('WebSocket emission failed:', socketError);
        }
      }

      // Handle the transition from waiting room to consultation room
      const participantIds = await this.db.participant
        .findMany({
          where: { consultationId: dto.consultationId },
          select: { userId: true },
        })
        .then((participants) => participants.map((p) => p.userId));

      await this.consultationUtilityService.handleConsultationRoomTransition(
        dto.consultationId,
        'waiting',
        'consultation',
        participantIds,
        user.role,
      );

      return ApiResponseDto.success(
        {
          success: true,
          statusCode: 200,
          message: 'Patient admitted and consultation activated.',
          consultationId: dto.consultationId,
        },
        'Patient admitted successfully',
        200,
      );
    } catch (error) {
      if (error.code === 'P2025') {
        throw HttpExceptionHelper.conflict(
          'Consultation state changed. Please refresh and retry.',
          error,
        );
      }
      console.error('Admission failed:', error);
      throw HttpExceptionHelper.internalServerError(
        'Failed to admit patient',
        error,
      );
    }
  }

  private estimateWaitTime(queuePosition: number): string {
    const averageConsultationMinutes = 10;
    const waitMinutes = queuePosition * averageConsultationMinutes;
    if (waitMinutes < 60)
      return `${waitMinutes} min${waitMinutes > 1 ? 's' : ''}`;
    const hours = Math.floor(waitMinutes / 60);
    const minutes = waitMinutes % 60;
    return minutes === 0
      ? `${hours} hour${hours > 1 ? 's' : ''}`
      : `${hours}h ${minutes}m`;
  }

  async getWaitingRoomConsultations(
    practitionerId: number,
    page = 1,
    limit = 10,
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<ApiResponseDto<WaitingRoomPreviewResponseDto>> {
    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
      select: {
        id: true,
        role: true,
        GroupMember: { select: { groupId: true } },
        specialities: { select: { specialityId: true } }
      },
    });
    if (!practitioner) throw HttpExceptionHelper.notFound('User not found');

    const skip = (page - 1) * limit;
    const waitingTimeoutMs = 30 * 60000;

    const now = new Date();

    // Clean up old waiting consultations
    await this.db.consultation.updateMany({
      where: {
        status: ConsultationStatus.WAITING,
        scheduledDate: { lt: new Date(now.getTime() - waitingTimeoutMs) },
      },
      data: { status: ConsultationStatus.TERMINATED_OPEN },
    });

    // Build filter for unassigned consultations that match practitioner's groups/specialties
    const practitionerGroupIds = practitioner.GroupMember.map(gm => gm.groupId);
    const practitionerSpecialityIds = practitioner.specialities.map(s => s.specialityId);

    const whereClause: any = {
      status: ConsultationStatus.WAITING,
      ownerId: null, // Only show unassigned consultations
      participants: {
        some: { isActive: true, user: { role: UserRole.PATIENT } },
      },
      NOT: {
        participants: {
          some: { isActive: true, user: { role: UserRole.PRACTITIONER } },
        },
      },
      OR: []
    };

    // If practitioner is in groups, show consultations for those groups
    if (practitionerGroupIds.length > 0) {
      whereClause.OR.push({
        groupId: { in: practitionerGroupIds }
      });
    }

    // If practitioner has specialities, show consultations for those specialities
    if (practitionerSpecialityIds.length > 0) {
      whereClause.OR.push({
        specialityId: { in: practitionerSpecialityIds }
      });
    }

    // If practitioner is admin, show all unassigned consultations
    if (practitioner.role === UserRole.ADMIN) {
      delete whereClause.OR;
      // Remove group/specialty restrictions for admins
    } else if (whereClause.OR.length === 0) {
      // If practitioner has no groups or specialities, show no consultations
      return ApiResponseDto.success(
        new WaitingRoomPreviewResponseDto({
          success: true,
          statusCode: 200,
          message: 'No consultations available for your specialization.',
          waitingRooms: [],
          totalCount: 0,
          currentPage: page,
          totalPages: 0,
        }),
        'No consultations available for your specialization.',
        200,
      );
    }

    const consultations = await this.db.consultation.findMany({
      where: whereClause,
      orderBy: { scheduledDate: sortOrder },
      skip,
      take: limit,
      include: {
        participants: {
          where: { isActive: true, user: { role: UserRole.PATIENT } },
          select: {
            joinedAt: true,
            user: {
              select: { firstName: true, lastName: true, country: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        group: { select: { name: true } },
        speciality: { select: { name: true } }
      },
    });

    const totalCount = await this.db.consultation.count({
      where: whereClause,
    });

    const waitingRooms = consultations.map((c, index) => {
      const patient = c.participants[0]?.user;
      return {
        id: c.id,
        patientInitials: patient
          ? `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`
          : '',
        joinTime: c.participants[0]?.joinedAt ?? null,
        language: patient?.country ?? null,
        queuePosition: index + 1 + skip,
        estimatedWaitTime: this.estimateWaitTime(index + 1 + skip),
        group: c.group?.name ?? null,
        speciality: c.speciality?.name ?? null,
      };
    });

    const responsePayload = new WaitingRoomPreviewResponseDto({
      success: true,
      statusCode: 200,
      message: 'Waiting room consultations fetched.',
      waitingRooms,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    });

    return ApiResponseDto.success(
      responsePayload,
      responsePayload.message,
      200,
    );
  }

  async getPatientConsultationHistory(
    patientId: number,
  ): Promise<ConsultationPatientHistoryItemDto[]> {
    const user = await this.db.user.findUnique({ where: { id: patientId } });
    if (!user) {
      throw HttpExceptionHelper.notFound('User not found');
    }
    if (user.role !== UserRole.PATIENT) {
      throw HttpExceptionHelper.forbidden(
        'Only patients can access their consultation history',
      );
    }

    const consultations = await this.db.consultation.findMany({
      where: {
        participants: {
          some: {
            userId: patientId,
            user: { role: UserRole.PATIENT },
          },
        },
      },
      include: {
        owner: {
          select: {
            firstName: true,
            lastName: true,
            specialities: {
              include: { speciality: true },
            },
          },
        },
        participants: {
          include: { user: true },
        },
        rating: true,
      },
      orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
    });

    const now = new Date();

    return consultations.map((c) => {
      const canJoin =
        c.status === ConsultationStatus.ACTIVE &&
        !!c.owner &&
        !!c.participants.find((p) => p.userId === patientId && p.isActive);

      const waitingForDoctor =
        c.status === ConsultationStatus.WAITING &&
        (!c.owner ||
          !c.participants.find((p) => p.userId === c.ownerId && p.isActive));

      let remainingDays: number | undefined = undefined;
      if (c.status === ConsultationStatus.SCHEDULED && c.scheduledDate) {
        remainingDays = Math.max(
          0,
          Math.ceil(
            (c.scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        );
      }

      const practitionerName = c.owner
        ? `${c.owner.firstName} ${c.owner.lastName}`
        : '';
      const practitionerSpeciality = c.owner
        ? c.owner.specialities.map((s) => s.speciality.name)
        : [];

      let rating:
        | { value: number; color: 'green' | 'red' | null; done: boolean }
        | undefined = undefined;
      if (c.status === ConsultationStatus.COMPLETED && c.rating) {
        rating = {
          value: c.rating.rating,
          color: c.rating.rating >= 4 ? 'green' : 'red',
          done: true,
        };
      } else if (c.status === ConsultationStatus.COMPLETED) {
        rating = {
          value: 0,
          color: null,
          done: false,
        };
      }

      return {
        consultationId: c.id,
        practitionerName,
        practitionerSpeciality,
        scheduledDate: c.scheduledDate,
        startedAt: c.startedAt,
        closedAt: c.closedAt,
        status: c.status,
        remainingDays,
        canJoin,
        waitingForDoctor,
        rating,
      };
    });
  }

  async endConsultation(
    endDto: EndConsultationDto,
    userId: number,
  ): Promise<ApiResponseDto<EndConsultationResponseDto>> {
    const start = Date.now();
    const consultation = await this.db.consultation.findUnique({
      where: { id: endDto.consultationId },
      include: { participants: true, owner: true },
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    // Validate user is practitioner or admin
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw HttpExceptionHelper.notFound('User not found');
    if (user.role !== UserRole.PRACTITIONER && user.role !== UserRole.ADMIN) {
      throw HttpExceptionHelper.forbidden(
        'Only practitioners or admins can end consultations',
      );
    }

    // Validate consultation ownership
    if (consultation.ownerId !== userId && user.role !== UserRole.ADMIN) {
      throw HttpExceptionHelper.forbidden(
        'Not authorized to end this consultation',
      );
    }

    const ALLOWED_TERMINATION_STATUSES = new Set<ConsultationStatus>([
      ConsultationStatus.ACTIVE,
      ConsultationStatus.WAITING,
      ConsultationStatus.SCHEDULED,
    ]);

    if (!ALLOWED_TERMINATION_STATUSES.has(consultation.status)) {
      throw HttpExceptionHelper.badRequest(
        'Consultation must be active, waiting, or scheduled to be terminated',
      );
    }

    let newStatus: ConsultationStatus;
    let message: string;
    let deletionScheduledAt: Date | undefined = undefined;
    let retentionHours: number | undefined = undefined;

    if (endDto.action === 'close') {
      newStatus = ConsultationStatus.COMPLETED;
      message = 'Consultation closed successfully';

      // Get retention period from config service
      retentionHours = this.configService.consultationRetentionHours;
      deletionScheduledAt = new Date();
      deletionScheduledAt.setHours(
        deletionScheduledAt.getHours() + retentionHours,
      );
    } else {
      newStatus = ConsultationStatus.TERMINATED_OPEN;
      message = 'Consultation terminated but kept open';
    }

    try {
      await this.db.consultation.update({
        where: { id: endDto.consultationId },
        data: {
          status: newStatus,
          closedAt: new Date(),
          deletionScheduledAt,
          version: { increment: 1 }, // Optimistic concurrency control
          participants: {
            updateMany: {
              where: { consultationId: endDto.consultationId },
              data: { isActive: false },
            },
          },
        },
        include: { participants: true },
      });

      // Enhanced consultation state transition with proper MediaSoup cleanup
      try {
        await this.consultationMediaSoupService.transitionConsultationState(
          endDto.consultationId,
          newStatus,
          userId,
        );
        this.logger.log(
          `Enhanced consultation termination completed for consultation ${endDto.consultationId}`,
        );
      } catch (transitionError) {
        this.logger.error(
          `Enhanced consultation termination failed for consultation ${endDto.consultationId}: ${transitionError.message}`,
          transitionError.stack,
        );
        // Continue with manual cleanup if enhanced method fails
        try {
          await this.mediasoupSessionService.cleanupRouterForConsultation(
            endDto.consultationId,
          );
        } catch (mediasoupError) {
          this.logger.error(
            `Manual MediaSoup cleanup also failed: ${mediasoupError.message}`,
          );
        }
      }

      if (this.consultationGateway.server) {
        try {
          this.consultationGateway.server
            .to(`consultation:${endDto.consultationId}`)
            .emit('consultation_ended', {
              status: newStatus,
              action: endDto.action,
              terminatedBy: userId,
              deletionTime: deletionScheduledAt,
              retentionHours: retentionHours,
              bufferHours:
                endDto.action === 'close'
                  ? this.configService.consultationDeletionBufferHours
                  : null,
            });
          this.consultationGateway.server
            .to(`consultation:${endDto.consultationId}`)
            .emit('media_session_closed', {
              consultationId: endDto.consultationId,
              cleanupCompleted: true,
            });
        } catch (socketError) {
          this.logger.error('WebSocket emission failed:', socketError);
        }
      }

      const durationMs = Date.now() - start;
      this.logger.log(
        `Consultation ${endDto.consultationId} ended by user ${userId} in ${durationMs}ms`,
      );

      // Cancel any pending reminders
      try {
        await this.reminderService.cancelReminders(endDto.consultationId);
      } catch (error) {
        this.logger.error(
          `Failed to cancel reminders for consultation ${endDto.consultationId}:`,
          error,
        );
        // Continue despite reminder cancellation failure
      }

      const responsePayload: EndConsultationResponseDto = {
        success: true,
        message,
        consultationId: endDto.consultationId,
        status: newStatus,
        deletionScheduledAt,
        retentionHours,
        action: endDto.action,
      };

      return ApiResponseDto.success(
        responsePayload,
        responsePayload.message,
        200,
      );
    } catch (error) {
      if (error.code === 'P2025') {
        throw HttpExceptionHelper.conflict(
          'Consultation state changed. Please refresh and retry.',
          error,
        );
      }
      console.error('Admission failed:', error);
      throw HttpExceptionHelper.internalServerError(
        'Failed to admit patient',
        error,
      );
    }
  }

  async rateConsultation(
    patientId: number,
    dto: RateConsultationDto,
  ): Promise<ApiResponseDto<{ success: boolean }>> {
    const consultation = await this.db.consultation.findUnique({
      where: { id: dto.consultationId },
      include: {
        participants: true,
        rating: true,
      },
    });

    if (!consultation)
      throw HttpExceptionHelper.notFound('Consultation not found');

    if (consultation.status !== ConsultationStatus.COMPLETED)
      throw HttpExceptionHelper.badRequest('Consultation not completed');

    if (
      !consultation.participants.some(
        (p) => p.userId === patientId && p.isBeneficiary,
      )
    ) {
      throw HttpExceptionHelper.forbidden('Not authorized');
    }

    if (consultation.rating)
      throw HttpExceptionHelper.conflict('Already rated');

    await this.db.consultationRating.create({
      data: {
        consultationId: consultation.id,
        patientId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    return ApiResponseDto.success(
      { success: true },
      'Consultation rated successfully',
      200,
    );
  }

  async getConsultationHistory(
    practitionerId: number,
    status?: ConsultationStatus,
  ): Promise<ConsultationHistoryItemDto[]> {
    const whereClause: any = { ownerId: practitionerId };
    if (status) {
      whereClause.status = status;
    } else {
      whereClause.status = {
        in: [ConsultationStatus.COMPLETED, ConsultationStatus.TERMINATED_OPEN],
      };
    }

    const consults = await this.db.consultation.findMany({
      where: whereClause,
      include: {
        participants: {
          include: { user: true },
        },
      },
      orderBy: { closedAt: 'desc' },
    });

    return consults.map((c) => this.mapToHistoryItem(c));
  }

  async getConsultationDetails(id: number): Promise<ConsultationDetailDto> {
    const c = await this.db.consultation.findUnique({
      where: { id },
      include: {
        participants: { include: { user: true } },
        messages: true,
      },
    });
    if (!c) throw HttpExceptionHelper.notFound('Consultation not found');

    const base = this.mapToHistoryItem(c);
    return {
      ...base,
      messages: c.messages.map((m) => ({
        id: m.id,
        userId: m.userId,
        content: m.content,
        mediaUrl: m.mediaUrl ?? null,
        mediaType: m.mediaType ?? null,
        consultationId: m.consultationId,
        createdAt: m.createdAt,
      })),
    };
  }

  async downloadConsultationPdf(
    consultationId: number,
    requestingUserId: number,
  ): Promise<Buffer> {
    try {
      console.log(
        `Starting PDF generation for consultation ${consultationId} by user ${requestingUserId}`,
      );

      const consultation = await this.db.consultation.findUnique({
        where: { id: consultationId },
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              specialities: {
                include: { speciality: true },
              },
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  role: true,
                  country: true,
                  sex: true,
                  phoneNumber: true,
                },
              },
            },
          },
          messages: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          rating: {
            include: {
              patient: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          group: {
            select: {
              name: true,
              description: true,
            },
          },
          speciality: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      const isAuthorized =
        consultation.ownerId === requestingUserId ||
        consultation.participants.some((p) => p.userId === requestingUserId) ||
        (await this.isUserAdmin(requestingUserId));

      if (!isAuthorized) {
        throw HttpExceptionHelper.forbidden(
          'Not authorized to download this consultation report',
        );
      }

      return await this.generateConsultationPDF(consultation);
    } catch (error) {
      console.error(`Error in downloadConsultationPdf:`, error);
      throw error;
    }
  }

  private async isUserAdmin(userId: number): Promise<boolean> {
    try {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      return user?.role === 'ADMIN';
    } catch (error) {
      console.error(`Error checking admin status for user ${userId}:`, error);
      return false;
    }
  }

  private generateConsultationPDF(consultation: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.addPDFHeader(doc, consultation);
        this.addConsultationOverview(doc, consultation);
        this.addParticipantsSection(doc, consultation);
        this.addChatHistory(doc, consultation);
        this.addFeedbackSection(doc, consultation);
        this.addPDFFooter(doc);
        doc.end();
      } catch (error) {
        console.error('Error in generateConsultationPDF:', error);
        reject(error);
      }
    });
  }

  private addPDFHeader(doc: PDFKit.PDFDocument, consultation: any): void {
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('CONSULTATION REPORT', { align: 'center' });

    doc.moveDown();
    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Report Generated: ${new Date().toLocaleString()}`, {
        align: 'right',
      });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
  }

  private addConsultationOverview(
    doc: PDFKit.PDFDocument,
    consultation: any,
  ): void {
    doc.fontSize(16).font('Helvetica-Bold').text('CONSULTATION OVERVIEW');
    doc.moveDown(0.5);

    const overview = [
      ['Consultation ID:', consultation.id?.toString() || 'N/A'],
      ['Status:', consultation.status || 'N/A'],
      [
        'Scheduled Date:',
        consultation.scheduledDate
          ? new Date(consultation.scheduledDate).toLocaleString()
          : 'Not scheduled',
      ],
      [
        'Started At:',
        consultation.startedAt
          ? new Date(consultation.startedAt).toLocaleString()
          : 'N/A',
      ],
      [
        'Closed At:',
        consultation.closedAt
          ? new Date(consultation.closedAt).toLocaleString()
          : 'N/A',
      ],
      [
        'Duration:',
        this.calculateDuration(consultation.startedAt, consultation.closedAt),
      ],
      ['Group:', consultation.group?.name || 'Individual Consultation'],
      ['Speciality:', consultation.speciality?.name || 'General'],
      ['Symptoms:', consultation.symptoms || 'N/A'],
      ['Message Service:', consultation.messageService || 'N/A'],
      [
        'Created At:',
        consultation.createdAt
          ? new Date(consultation.createdAt).toLocaleString()
          : 'N/A',
      ],
    ];

    overview.forEach(([label, value]) => {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(label, { continued: true, width: 150 });
      doc.font('Helvetica').text(` ${value || 'N/A'}`);
    });

    doc.moveDown();
  }

  private addParticipantsSection(
    doc: PDFKit.PDFDocument,
    consultation: any,
  ): void {
    doc.fontSize(16).font('Helvetica-Bold').text('PARTICIPANTS');
    doc.moveDown(0.5);

    if (consultation.owner) {
      doc.fontSize(12).font('Helvetica-Bold').text('Practitioner:');
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `Name: ${consultation.owner.firstName || ''} ${consultation.owner.lastName || ''}`,
        )
        .text(`Email: ${consultation.owner.email || 'N/A'}`)
        .text(
          `Specialities: ${consultation.owner.specialities
            ?.map((s) => s.speciality?.name)
            .filter(Boolean)
            .join(', ') || 'N/A'
          }`,
        );
      doc.moveDown(0.5);
    }

    const patients =
      consultation.participants?.filter((p) => p.user?.role === 'PATIENT') ||
      [];
    if (patients.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Patient(s):');
      patients.forEach((participant, index) => {
        const user = participant.user;
        if (user) {
          doc
            .fontSize(10)
            .font('Helvetica')
            .text(
              `${index + 1}. Name: ${user.firstName || ''} ${user.lastName || ''}`,
            )
            .text(`   Email: ${user.email || 'N/A'}`)
            .text(`   Phone: ${user.phoneNumber || 'N/A'}`)
            .text(`   Country: ${user.country || 'N/A'}`)
            .text(`   Gender: ${user.sex || 'N/A'}`)
            .text(
              `   Joined At: ${participant.joinedAt ? new Date(participant.joinedAt).toLocaleString() : 'N/A'}`,
            )
            .text(`   Active: ${participant.isActive ? 'Yes' : 'No'}`)
            .text(
              `   In Waiting Room: ${participant.inWaitingRoom ? 'Yes' : 'No'}`,
            )
            .text(
              `   Is Beneficiary: ${participant.isBeneficiary ? 'Yes' : 'No'}`,
            )
            .text(`   Language: ${participant.language || 'N/A'}`)
            .text(
              `   Last Seen: ${participant.lastSeenAt ? new Date(participant.lastSeenAt).toLocaleString() : 'N/A'}`,
            );
          doc.moveDown(0.3);
        }
      });
    }

    doc.moveDown();
  }

  private addChatHistory(doc: PDFKit.PDFDocument, consultation: any): void {
    if (
      consultation.messages &&
      consultation.messages.length > 0 &&
      doc.y > 600
    ) {
      doc.addPage();
    }

    doc.fontSize(16).font('Helvetica-Bold').text('CHAT HISTORY');
    doc.moveDown(0.5);

    if (!consultation.messages || consultation.messages.length === 0) {
      doc
        .fontSize(10)
        .font('Helvetica-Oblique')
        .text('No messages recorded for this consultation.');
      doc.moveDown();
      return;
    }

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Total Messages: ${consultation.messages.length}`);
    doc.moveDown(0.5);

    consultation.messages.forEach((message, index) => {
      if (doc.y > 720) {
        doc.addPage();
      }

      const user = message.user;
      const userName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`
        : 'Unknown User';
      const role = user?.role || 'Unknown';
      const timestamp = message.createdAt
        ? new Date(message.createdAt).toLocaleString()
        : 'Unknown time';
      const isSystemMessage = message.isSystem ? ' (System)' : '';

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`[${timestamp}] ${userName} (${role})${isSystemMessage}:`);

      doc
        .fontSize(9)
        .font('Helvetica')
        .text(message.content || '', { indent: 20 });

      if (message.mediaUrl) {
        doc
          .fontSize(8)
          .font('Helvetica-Oblique')
          .text(
            `Media: ${message.mediaType || 'Unknown'} - ${message.mediaUrl}`,
            { indent: 20 },
          );
      }

      if (message.editedAt) {
        doc
          .fontSize(8)
          .font('Helvetica-Oblique')
          .text(`(Edited at: ${new Date(message.editedAt).toLocaleString()})`, {
            indent: 20,
          });
      }

      doc.moveDown(0.3);
    });

    doc.moveDown();
  }

  private addFeedbackSection(doc: PDFKit.PDFDocument, consultation: any): void {
    doc.fontSize(16).font('Helvetica-Bold').text('FEEDBACK & RATINGS');
    doc.moveDown(0.5);

    if (consultation.rating) {
      doc.fontSize(12).font('Helvetica-Bold').text('Patient Rating:');
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Rating: ${consultation.rating.rating || 'N/A'}/5 stars`)
        .text(
          `Rated by: ${consultation.rating.patient?.firstName || ''} ${consultation.rating.patient?.lastName || ''}`,
        )
        .text(
          `Date: ${consultation.rating.createdAt ? new Date(consultation.rating.createdAt).toLocaleString() : 'N/A'}`,
        );

      if (consultation.rating.comment) {
        doc.text(`Comment: ${consultation.rating.comment}`);
      }
    } else {
      doc
        .fontSize(10)
        .font('Helvetica-Oblique')
        .text('No patient rating provided for this consultation.');
    }

    doc.moveDown();
  }

  private addPDFFooter(doc: PDFKit.PDFDocument): void {
    doc
      .fontSize(8)
      .font('Helvetica')
      .text('Confidential Medical Document', 50, doc.page.height - 35, {
        align: 'center',
      });
  }

  private calculateDuration(
    startedAt: Date | null,
    closedAt: Date | null,
  ): string {
    if (!startedAt || !closedAt) return 'N/A';

    const diffMs = new Date(closedAt).getTime() - new Date(startedAt).getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  private mapToHistoryItem(c: any): ConsultationHistoryItemDto {
    const start = c.startedAt || c.createdAt;
    const end = c.closedAt || new Date();
    const diffMs = end.getTime() - new Date(start).getTime();
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    const duration = mins ? `${mins}m ${secs}s` : `${secs}s`;

    const patientPart = c.participants.find(
      (p: any) => p.user.role === UserRole.PATIENT,
    );
    if (!patientPart) {
      throw HttpExceptionHelper.internalServerError(
        'Consultation has no patient participant',
      );
    }

    return {
      consultation: {
        id: c.id,
        scheduledDate: c.scheduledDate,
        createdAt: c.createdAt,
        startedAt: c.startedAt,
        closedAt: c.closedAt,
        createdBy: c.createdBy,
        groupId: c.groupId,
        ownerId: c.ownerId,
        messageService: c.messageService,
        whatsappTemplateId: c.whatsappTemplateId,
        status: c.status,
      },
      patient: {
        id: patientPart.user.id,
        role: patientPart.user.role,
        firstName: patientPart.user.firstName,
        lastName: patientPart.user.lastName,
        phoneNumber: patientPart.user.phoneNumber,
        country: patientPart.user.country,
        sex: patientPart.user.sex,
        status: patientPart.user.status,
      },
      duration,
    };
  }

  async getOpenConsultations(
    practitionerId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<ApiResponseDto<OpenConsultationResponseDto>> {
    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
    });
    if (!practitioner) {
      throw HttpExceptionHelper.notFound('Practitioner not found');
    }
    if (practitioner.role !== UserRole.PRACTITIONER) {
      throw HttpExceptionHelper.forbidden('User is not a practitioner');
    }

    const skip = (page - 1) * limit;

    const total = await this.db.consultation.count({
      where: {
        ownerId: practitionerId,
        closedAt: null,
        startedAt: { not: null },
      },
    });

    const consultations = await this.db.consultation.findMany({
      where: {
        ownerId: practitionerId,
        closedAt: null,
        startedAt: { not: null },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                sex: true,
                role: true,
              },
            },
          },
        },
        group: {
          select: {
            name: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { id: 'desc' },
          select: {
            content: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      skip,
      take: limit,
    });

    const consultationItems: OpenConsultationItemDto[] = consultations.map(
      (consultation) => {
        const patientParticipant = consultation.participants.find(
          (p) => p.user.role === UserRole.PATIENT,
        );

        const patient = patientParticipant?.user;
        const activeParticipants = consultation.participants.filter(
          (p) => p.isActive,
        ).length;

        const patientDto: OpenConsultationPatientDto = {
          id: patient?.id || 0,
          firstName: patient?.firstName || null,
          lastName: patient?.lastName || null,
          initials: patient
            ? `${patient.firstName?.[0] || ''}${patient.lastName?.[0] || ''}`
            : 'N/A',
          sex: patient?.sex || null,
          isOffline: patientParticipant ? !patientParticipant.isActive : true,
        };

        const timeSinceStart = this.calculateTimeSinceStart(
          consultation.startedAt!,
        );

        return {
          id: consultation.id,
          patient: patientDto,
          timeSinceStart,
          participantCount: activeParticipants,
          lastMessage: consultation.messages[0]?.content || null,
          status: consultation.status,
          startedAt: consultation.startedAt!,
          groupName: consultation.group?.name || null,
        };
      },
    );

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const responseData: OpenConsultationResponseDto = {
      consultations: consultationItems,
      total,
      currentPage: page,
      totalPages,
      limit,
      hasNextPage,
      hasPreviousPage,
    };

    return ApiResponseDto.success(
      responseData,
      'Open consultations fetched successfully',
      200,
    );
  }

  private calculateTimeSinceStart(startedAt: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(startedAt).getTime();

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ago`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just started';
    }
  }

  async getOpenConsultationDetails(
    consultationId: number,
    practitionerId: number,
  ): Promise<ConsultationDetailDto> {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      select: { ownerId: true, closedAt: true },
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    if (consultation.ownerId !== practitionerId) {
      throw HttpExceptionHelper.forbidden(
        'Not authorized to view this consultation',
      );
    }

    if (consultation.closedAt) {
      throw HttpExceptionHelper.badRequest('Consultation is already closed');
    }

    return this.getConsultationDetails(consultationId);
  }

  async assignPractitionerToConsultation(
    consultationId: number,
    practitionerId: number,
    adminUserId: number,
  ): Promise<Consultation | null> {
    const adminUser = await this.db.user.findUnique({
      where: { id: adminUserId },
    });
    if (!adminUser || adminUser.role !== UserRole.ADMIN) {
      throw HttpExceptionHelper.forbidden(
        'Only admins can assign practitioners',
      );
    }

    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    // Allow admin assignment for both DRAFT and WAITING consultations
    if (consultation.status !== ConsultationStatus.DRAFT && consultation.status !== ConsultationStatus.WAITING) {
      throw HttpExceptionHelper.badRequest(
        'Only draft or waiting consultations can be assigned a practitioner',
      );
    }

    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
    });
    if (!practitioner || practitioner.role !== UserRole.PRACTITIONER) {
      throw HttpExceptionHelper.badRequest('Invalid practitioner');
    }

    const updatedConsultation = await this.db.consultation.update({
      where: { id: consultationId },
      data: {
        ownerId: practitionerId,
        status: ConsultationStatus.SCHEDULED,
        version: { increment: 1 },
      },
      include: {
        owner: true,
        participants: {
          where: { user: { role: UserRole.PATIENT } },
          include: { user: true }
        }
      },
    });

    // Send email notification to patient
    await this.sendPatientAssignmentNotification(updatedConsultation, practitioner);

    // Emit real-time cleanup events
    await this.emitWaitingRoomCleanup(consultationId, practitionerId);

    return updatedConsultation;
  }

  /**
   * Self-assignment method for practitioners to claim unassigned consultations
   */
  async selfAssignConsultation(
    consultationId: number,
    practitionerId: number,
  ): Promise<ApiResponseDto<Consultation>> {
    try {
      const practitioner = await this.db.user.findUnique({
        where: { id: practitionerId },
        include: {
          GroupMember: { select: { groupId: true } },
          specialities: { select: { specialityId: true } }
        }
      });

      if (!practitioner || practitioner.role !== UserRole.PRACTITIONER) {
        throw HttpExceptionHelper.forbidden('Invalid practitioner');
      }

      const consultation = await this.db.consultation.findUnique({
        where: { id: consultationId },
        include: {
          participants: {
            where: { user: { role: UserRole.PATIENT } },
            include: { user: true }
          }
        }
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      if (consultation.status !== ConsultationStatus.WAITING) {
        throw HttpExceptionHelper.badRequest(
          'Only waiting consultations can be self-assigned',
        );
      }

      if (consultation.ownerId !== null) {
        throw HttpExceptionHelper.conflict(
          'Consultation is already assigned to another practitioner',
        );
      }

      // Verify practitioner is eligible for this consultation
      const practitionerGroupIds = practitioner.GroupMember.map(gm => gm.groupId);
      const practitionerSpecialityIds = practitioner.specialities.map(s => s.specialityId);

      const isEligible =
        (consultation.groupId && practitionerGroupIds.includes(consultation.groupId)) ||
        (consultation.specialityId && practitionerSpecialityIds.includes(consultation.specialityId));

      if (!isEligible) {
        throw HttpExceptionHelper.forbidden(
          'You are not eligible to assign this consultation. Check your group/speciality access.',
        );
      }

      // Atomic assignment to prevent race conditions
      const updatedConsultation = await this.db.consultation.update({
        where: {
          id: consultationId,
          ownerId: null, // Double-check it's still unassigned
        },
        data: {
          ownerId: practitionerId,
          status: ConsultationStatus.SCHEDULED,
          version: { increment: 1 },
        },
        include: {
          owner: true,
          participants: {
            where: { user: { role: UserRole.PATIENT } },
            include: { user: true }
          }
        },
      });

      // Send email notification to patient
      await this.sendPatientAssignmentNotification(updatedConsultation, practitioner);

      // Emit real-time cleanup events
      await this.emitWaitingRoomCleanup(consultationId, practitionerId);

      return ApiResponseDto.success(
        updatedConsultation,
        'Consultation successfully assigned to you',
      );
    } catch (error) {
      if (error.code === 'P2025') {
        throw HttpExceptionHelper.conflict(
          'Consultation was already assigned to another practitioner',
        );
      }
      throw error;
    }
  }

  /**
   * Send email notification to patient when practitioner is assigned
   */
  private async sendPatientAssignmentNotification(
    consultation: any,
    practitioner: any,
  ): Promise<void> {
    try {
      const patient = consultation.participants?.find(p => p.user.role === UserRole.PATIENT);
      if (!patient) {
        this.logger.warn(`No patient found for consultation ${consultation.id}`);
        return;
      }

      const patientEmail = patient.user.email;
      const patientName = `${patient.user.firstName} ${patient.user.lastName}`;
      const practitionerName = `Dr. ${practitioner.firstName} ${practitioner.lastName}`;

      // Get the frontend URL from config
      const frontendUrl = this.configService.patientUrl;
      const schedulingLink = `${frontendUrl}/consultations/${consultation.id}/schedule`;

      await this.emailService.sendConsultationAssignedEmail(
        patientEmail,
        patientName,
        practitionerName,
        consultation.id,
        schedulingLink,
      );

      this.logger.log(
        `Assignment notification email sent to patient ${patientEmail} for consultation ${consultation.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send assignment notification email for consultation ${consultation.id}:`,
        error,
      );
      // Don't throw - email failure shouldn't break the assignment
    }
  }

  /**
   * Emit real-time events to clean up waiting rooms after assignment
   */
  private async emitWaitingRoomCleanup(
    consultationId: number,
    assignedPractitionerId: number,
  ): Promise<void> {
    try {
      // Get all practitioners who might have had this consultation in their waiting room
      const eligiblePractitioners = await this.db.user.findMany({
        where: {
          role: { in: [UserRole.PRACTITIONER, UserRole.ADMIN] },
          id: { not: assignedPractitionerId }, // Exclude the assigned practitioner
        },
        select: { id: true },
      });

      // Emit cleanup events to all other practitioners
      for (const practitioner of eligiblePractitioners) {
        this.consultationGateway.emitToUser(practitioner.id, 'waiting_room_consultation_assigned', {
          consultationId,
          assignedToPractitionerId: assignedPractitionerId,
          message: 'This consultation has been assigned to another practitioner',
        });
      }

      // Emit assignment confirmation to the assigned practitioner
      this.consultationGateway.emitToUser(assignedPractitionerId, 'consultation_self_assigned', {
        consultationId,
        practitionerId: assignedPractitionerId,
        message: 'You have successfully claimed this consultation',
      });

      // Also emit to the consultation room for any connected clients
      this.consultationGateway.emitToRoom(consultationId, 'practitioner_assigned', {
        consultationId,
        practitionerId: assignedPractitionerId,
        message: 'Practitioner has been assigned to this consultation',
      });

      this.logger.log(
        `Emitted waiting room cleanup events for consultation ${consultationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit waiting room cleanup events for consultation ${consultationId}:`,
        error,
      );
      // Don't throw - WebSocket failure shouldn't break the assignment
    }
  }


  async getSessionStatus(consultationId: number) {
    try {
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
            },
            where: {
              isActive: true
            }
          },
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          }
        }
      });

      if (!consultation) {
        throw new NotFoundException(`Consultation with ID ${consultationId} not found`);
      }

      let currentStage: 'waiting_room' | 'consultation_room' | 'completed';
      let redirectTo: 'waiting-room' | 'consultation-room' | undefined;
      let status: 'waiting' | 'active' | 'completed' | 'cancelled';

      // Map consultation status to frontend status
      switch (consultation.status) {
        case ConsultationStatus.DRAFT:
        case ConsultationStatus.SCHEDULED:
        case ConsultationStatus.WAITING:
          status = 'waiting';
          currentStage = 'waiting_room';
          redirectTo = 'waiting-room';
          break;
        case ConsultationStatus.ACTIVE:
          status = 'active';
          currentStage = 'consultation_room';
          redirectTo = 'consultation-room';
          break;
        case ConsultationStatus.COMPLETED:
          status = 'completed';
          currentStage = 'completed';
          break;
        case ConsultationStatus.CANCELLED:
        case ConsultationStatus.TERMINATED_OPEN:
          status = 'cancelled';
          currentStage = 'completed';
          break;
        default:
          status = 'waiting';
          currentStage = 'waiting_room';
          redirectTo = 'waiting-room';
      }

      const practitionerPresent = consultation.participants.some(
        p => p.user.role === UserRole.PRACTITIONER && p.isActive
      ) || (consultation.owner && consultation.owner.role === UserRole.PRACTITIONER);

      const estimatedWaitTime = status === 'waiting' ? 10 : 0; // 10 minutes default

      const waitingRoomUrl = status === 'waiting' ? `/waiting-room/${consultationId}` : undefined;
      const consultationRoomUrl = status === 'active' ? `/consultation-room/${consultationId}` : undefined;

      return {
        consultationId,
        status,
        currentStage,
        redirectTo,
        waitingRoomUrl,
        consultationRoomUrl,
        estimatedWaitTime,
        isActive: status === 'active' || status === 'waiting',
        lastUpdated: new Date().toISOString(),
        practitionerPresent,
        queuePosition: 1
      };

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to get session status for consultation ${consultationId}:`, error);
      throw HttpExceptionHelper.internalServerError(
        'Failed to retrieve session status'
      );
    }
  }

  async submitFeedback(
    dto: SubmitFeedbackDto,
    userId: number,
  ): Promise<ApiResponseDto<FeedbackResponseDto>> {
    try {
      // Verify consultation exists and user has access to it
      const consultation = await this.db.consultation.findUnique({
        where: { id: dto.consultationId },
        include: {
          participants: true,
          owner: true,
        },
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      // Check if user is a participant in the consultation
      const isParticipant = consultation.participants.some(
        (participant) => participant.userId === userId,
      );
      const isOwner = consultation.ownerId === userId;

      if (!isParticipant && !isOwner) {
        throw HttpExceptionHelper.forbidden(
          'You can only provide feedback for consultations you participated in',
        );
      }

      // Check if consultation is completed
      if (consultation.status !== ConsultationStatus.COMPLETED) {
        throw HttpExceptionHelper.badRequest(
          'Feedback can only be provided for completed consultations',
        );
      }

      // Check if feedback already exists for this consultation
      const existingFeedback = await this.db.consultationFeedback.findUnique({
        where: { consultationId: dto.consultationId },
      });

      let feedback;
      if (existingFeedback) {
        // Update existing feedback
        feedback = await this.db.consultationFeedback.update({
          where: { consultationId: dto.consultationId },
          data: {
            satisfaction: dto.satisfaction || null,
            comment: dto.comment || null,
          },
        });
      } else {
        // Create new feedback
        feedback = await this.db.consultationFeedback.create({
          data: {
            consultationId: dto.consultationId,
            userId: userId,
            satisfaction: dto.satisfaction || null,
            comment: dto.comment || null,
          },
        });
      }

      const responseData: FeedbackResponseDto = {
        id: feedback.id,
        consultationId: feedback.consultationId,
        userId: feedback.userId,
        satisfaction: feedback.satisfaction as FeedbackSatisfaction | null,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      };

      return ApiResponseDto.success(
        responseData,
        'Feedback submitted successfully',
        HttpStatus.CREATED,
      );
    } catch (error) {
      this.logger.error('Error submitting feedback:', error);
      if (error.status) {
        throw error;
      }
      throw HttpExceptionHelper.internalServerError(
        'Failed to submit feedback',
      );
    }
  }

  async getFeedback(
    consultationId: number,
    userId: number,
  ): Promise<ApiResponseDto<FeedbackResponseDto | null>> {
    try {
      // Verify consultation exists and user has access to it
      const consultation = await this.db.consultation.findUnique({
        where: { id: consultationId },
        include: {
          participants: true,
          owner: true,
        },
      });

      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }

      // Check if user is a participant in the consultation
      const isParticipant = consultation.participants.some(
        (participant) => participant.userId === userId,
      );
      const isOwner = consultation.ownerId === userId;

      if (!isParticipant && !isOwner) {
        throw HttpExceptionHelper.forbidden(
          'You can only view feedback for consultations you participated in',
        );
      }

      const feedback = await this.db.consultationFeedback.findUnique({
        where: { consultationId },
      });

      if (!feedback) {
        return ApiResponseDto.success(
          null,
          'No feedback found for this consultation',
          HttpStatus.OK,
        );
      }

      const responseData: FeedbackResponseDto = {
        id: feedback.id,
        consultationId: feedback.consultationId,
        userId: feedback.userId,
        satisfaction: feedback.satisfaction as FeedbackSatisfaction | null,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      };

      return ApiResponseDto.success(
        responseData,
        'Feedback retrieved successfully',
        HttpStatus.OK,
      );
    } catch (error) {
      this.logger.error('Error getting feedback:', error);
      if (error.status) {
        throw error;
      }
      throw HttpExceptionHelper.internalServerError(
        'Failed to retrieve feedback',
      );
    }
  }
}
