import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  ConsultationStatus,
  UserRole,
  Consultation,
  Participant,
  User,
  Message,
} from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import concat from 'concat-stream';
import { ConsultationGateway } from './consultation.gateway';
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
import {
  ConsultationPatientHistoryResponseDto,
  ConsultationPatientHistoryItemDto,
} from './dto/consultation-patient-history.dto';
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

type ConsultationWithParticipants = Consultation & {
  participants: (Participant & { user: User })[];
  owner?: User;
  messages?: Message[];
};

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly availabilityService: AvailabilityService,
    @Inject(forwardRef(() => MediasoupSessionService))
    private readonly mediasoupSessionService: MediasoupSessionService,
    @Inject(forwardRef(() => ConsultationGateway))
    private readonly consultationGateway: ConsultationGateway,
    private readonly reminderService: ReminderService,
  ) {}

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

    const consultation = await this.db.consultation.create({
      data: createData,
      include: { participants: true },
    });

    // Schedule reminders if consultation has a scheduled date and reminders are enabled
    if (consultation.scheduledDate && consultation.reminderEnabled && consultation.status === ConsultationStatus.SCHEDULED) {
      try {
        await this.reminderService.scheduleReminders(
          consultation.id,
          consultation.scheduledDate,
          createDto.reminderConfig?.types
        );
      } catch (error) {
        this.logger.error(`Failed to schedule reminders for consultation ${consultation.id}:`, error);
        // Continue despite reminder scheduling failure
      }
    }

    return ApiResponseDto.success(
      plainToInstance(ConsultationResponseDto, consultation),
      'Consultation created',
      201,
    );
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
        id: true,
        status: true,
        ownerId: true,
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
          `Mediasoup router initialized for consultation ${consultationId} (patient join)`,
        );
      }
    } catch (mediaErr) {
      this.logger.error(
        `Mediasoup router setup failed for consultation ${consultationId}: ${mediaErr.message}`,
        mediaErr.stack,
      );
      throw HttpExceptionHelper.internalServerError(
        'Failed to setup media session for consultation',
        mediaErr,
      );
    }

    if (consultation.ownerId && this.consultationGateway.server) {
      this.consultationGateway.server
        .to(`practitioner:${consultation.ownerId}`)
        .emit('patient_waiting', {
          consultationId,
          patientInitials: `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`,
          joinTime: new Date(),
          language: patient.country ?? null,
        });
    }

    if (routerCreated && this.consultationGateway.server) {
      this.consultationGateway.server
        .to(`consultation:${consultationId}`)
        .emit('media_session_live', { consultationId });
    }

    const responsePayload: JoinConsultationResponseDto = {
      success: true,
      statusCode: 200,
      message: 'Patient joined consultation and entered waiting room.',
      consultationId,
      mediasoup: { routerId: consultationId, active: true },
      status: consultation.status,
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
          mediaErr,
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

      const responsePayload: JoinConsultationResponseDto = {
        success: true,
        statusCode: 200,
        message: 'Practitioner joined and activated the consultation.',
        consultationId,
        mediasoup: { routerId: consultationId, active: true },
        sessionUrl: `/session/consultation/${consultationId}`,
        status: consultation.status,
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
      await this.db.consultation.update({
        where: { id: dto.consultationId },
        data: {
          status: ConsultationStatus.ACTIVE,
          version: consultation.version + 1,
        },
      });

      let routerCreated = false;
      try {
        let mediasoupRouter = this.mediasoupSessionService.getRouter(
          dto.consultationId,
        );
        if (!mediasoupRouter) {
          mediasoupRouter =
            await this.mediasoupSessionService.createRouterForConsultation(
              dto.consultationId,
            );
          routerCreated = true;
          this.logger.log(
            `Mediasoup router created for consultation ${dto.consultationId} (admitPatient)`,
          );
        }
      } catch (mediaErr) {
        this.logger.error(
          `Mediasoup router setup failed during admitPatient for consultation ${dto.consultationId}: ${mediaErr.message}`,
          mediaErr.stack,
        );
        throw HttpExceptionHelper.internalServerError(
          'Failed to setup media session for consultation',
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
          if (routerCreated) {
            this.consultationGateway.server
              .to(`consultation:${dto.consultationId}`)
              .emit('media_session_live', {
                consultationId: dto.consultationId,
              });
          }
        } catch (socketError) {
          this.logger.error('WebSocket emission failed:', socketError);
        }
      }

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
      select: { id: true },
    });
    if (!practitioner) throw HttpExceptionHelper.notFound('User not found');

    const skip = (page - 1) * limit;
    const waitingTimeoutMs = 30 * 60000;

    const now = new Date();
    await this.db.consultation.updateMany({
      where: {
        status: ConsultationStatus.WAITING,
        ownerId: practitionerId,
        scheduledDate: { lt: new Date(now.getTime() - waitingTimeoutMs) },
      },
      data: { status: ConsultationStatus.TERMINATED_OPEN },
    });

    const consultations = await this.db.consultation.findMany({
      where: {
        status: ConsultationStatus.WAITING,
        ownerId: practitionerId,
        participants: {
          some: { isActive: true, user: { role: UserRole.PATIENT } },
        },
        NOT: {
          participants: {
            some: { isActive: true, user: { role: UserRole.PRACTITIONER } },
          },
        },
      },
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
      },
    });

    const totalCount = await this.db.consultation.count({
      where: {
        status: ConsultationStatus.WAITING,
        ownerId: practitionerId,
        participants: {
          some: { isActive: true, user: { role: UserRole.PATIENT } },
        },
        NOT: {
          participants: {
            some: { isActive: true, user: { role: UserRole.PRACTITIONER } },
          },
        },
      },
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

      let mediasoupCleanupSuccess = false;
      try {
        await this.mediasoupSessionService.cleanupRouterForConsultation(
          endDto.consultationId,
        );
        mediasoupCleanupSuccess = true;
        this.logger.log(
          `Mediasoup cleanup completed for consultation ${endDto.consultationId}`,
        );
      } catch (mediasoupError) {
        this.logger.error(
          `Mediasoup cleanup failed for consultation ${endDto.consultationId}: ${mediasoupError.message}`,
          mediasoupError.stack,
        );
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
              mediasoupCleanupSuccess,
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
        this.logger.error(`Failed to cancel reminders for consultation ${endDto.consultationId}:`, error);
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
      this.logger.error(
        `Failed to end consultation ${endDto.consultationId}`,
        error,
      );
      throw HttpExceptionHelper.internalServerError(
        'Failed to end consultation',
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
    requesterId: number,
  ): Promise<Buffer> {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialities: {
              select: {
                speciality: { select: { name: true } },
              },
            },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                role: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                country: true,
                sex: true,
              },
            },
          },
        },
        rating: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!consultation) {
      throw HttpExceptionHelper.notFound('Consultation not found');
    }

    const requester = await this.db.user.findUnique({
      where: { id: requesterId },
      select: {
        role: true,
        id: true,
      },
    });

    if (!requester) {
      throw HttpExceptionHelper.notFound('User not found');
    }

    const isAdmin = requester.role === UserRole.ADMIN;
    const isOwner = consultation.ownerId === requesterId;
    const isParticipant = consultation.participants?.some(
      (p) => p.userId === requesterId,
    );

    if (!isAdmin && !isOwner && !isParticipant) {
      throw HttpExceptionHelper.forbidden(
        'You are not authorized to download this consultation',
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const stream = new PassThrough();

      const concatStream = concat((data: Buffer) => {
        resolve(data);
      });

      stream.on('error', reject);
      concatStream.on('error', reject);

      doc.pipe(stream).pipe(concatStream);

      doc.fontSize(20).text('Consultation Summary', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Consultation ID: ${consultation.id}`);
      doc.text(
        `Scheduled Date: ${consultation.scheduledDate?.toLocaleString() || 'Not scheduled'}`,
      );
      doc.text(`Status: ${consultation.status}`);
      doc.text(
        `Created At: ${consultation.createdAt?.toLocaleString() || '-'}`,
      );
      doc.text(`Closed At: ${consultation.closedAt?.toLocaleString() || '-'}`);
      doc.moveDown();

      if (consultation.ownerId) {
        doc.fontSize(14).text('Practitioner:', { underline: true });
        this.db.user
          .findUnique({
            where: { id: consultation.ownerId },
            select: {
              firstName: true,
              lastName: true,
              specialities: {
                select: { speciality: { select: { name: true } } },
              },
            },
          })
          .then((owner) => {
            if (!owner) {
              reject(HttpExceptionHelper.notFound('Owner not found'));
              return;
            }
            const name = `${owner.firstName} ${owner.lastName}`;
            const specialities = (owner.specialities ?? [])
              .map((s) => s.speciality.name)
              .join(', ');
            doc.fontSize(12).text(`Name: ${name}`);
            doc.text(`Specialities: ${specialities || 'N/A'}`);
            doc.moveDown();

            const patient = consultation.participants.find(
              (p) => p.user.role === UserRole.PATIENT,
            )?.user;
            if (patient) {
              doc.fontSize(14).text('Patient:', { underline: true });
              doc
                .fontSize(12)
                .text(`Name: ${patient.firstName} ${patient.lastName}`);
              doc.text(`Sex: ${patient.sex ?? 'NA'}`);
              doc.text(`Phone: ${patient.phoneNumber ?? 'NA'}`);
              doc.text(`Country: ${patient.country ?? 'NA'}`);
              doc.moveDown();
            }

            if (consultation.rating) {
              doc.fontSize(14).text('Patient Rating:', { underline: true });
              doc.fontSize(12).text(`Rating: ${consultation.rating.rating}/5`);
              if (consultation.rating.comment) {
                doc.text(`Comment: ${consultation.rating.comment}`);
              }
              doc.moveDown();
            }

            if (consultation.messages?.length) {
              doc.addPage();
              doc.fontSize(14).text('Messages Exchanged:', { underline: true });
              doc.moveDown(0.5);

              consultation.messages.forEach((msg) => {
                const sender = `${msg.user.firstName ?? ''} ${msg.user.lastName ?? ''}`;
                const role = msg.user.role;
                const time = msg.createdAt.toLocaleString();
                doc
                  .fontSize(11)
                  .fillColor('black')
                  .text(`[${time}] ${sender} (${role}):`, { continued: true })
                  .fillColor('blue')
                  .text(` ${msg.content}`);
                doc.moveDown(0.4);
              });
            }

            doc.end();
          })
          .catch(reject);
      } else {
        const patient = consultation.participants.find(
          (p) => p.user.role === UserRole.PATIENT,
        )?.user;
        if (patient) {
          doc.fontSize(14).text('Patient:', { underline: true });
          doc
            .fontSize(12)
            .text(`Name: ${patient.firstName} ${patient.lastName}`);
          doc.text(`Sex: ${patient.sex ?? 'NA'}`);
          doc.text(`Phone: ${patient.phoneNumber ?? 'NA'}`);
          doc.text(`Country: ${patient.country ?? 'NA'}`);
          doc.moveDown();
        }

        if (consultation.rating) {
          doc.fontSize(14).text('Patient Rating:', { underline: true });
          doc.fontSize(12).text(`Rating: ${consultation.rating.rating}/5`);
          if (consultation.rating.comment) {
            doc.text(`Comment: ${consultation.rating.comment}`);
          }
          doc.moveDown();
        }

        if (consultation.messages?.length) {
          doc.addPage();
          doc.fontSize(14).text('Messages Exchanged:', { underline: true });
          doc.moveDown(0.5);

          consultation.messages.forEach((msg) => {
            const sender = `${msg.user.firstName ?? ''} ${msg.user.lastName ?? ''}`;
            const role = msg.user.role;
            const time = msg.createdAt.toLocaleString();
            doc
              .fontSize(11)
              .fillColor('black')
              .text(`[${time}] ${sender} (${role}):`, { continued: true })
              .fillColor('blue')
              .text(` ${msg.content}`);
            doc.moveDown(0.4);
          });
        }

        doc.end();
      }
    });
  }

  private mapToHistoryItem(c: any): ConsultationHistoryItemDto {
    const start = c.startedAt || c.createdAt;
    const end = c.closedAt || new Date();
    const diffMs = end.getTime() - new Date(start).getTime();
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    const duration = mins ? `${mins}m ${secs}s` : `${secs}s`;

    const patientPart = c.participants.find(
      (p: any) => p.user.role === 'PATIENT',
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
    if (consultation.status !== ConsultationStatus.DRAFT) {
      throw HttpExceptionHelper.badRequest(
        'Only draft consultations can be assigned a practitioner',
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
      include: { owner: true },
    });

    return updatedConsultation;
  }

  async getMessages(consultationId: number, beforeId?: number, limit = 30) {
    return await this.db.message.findMany({
      where: {
        consultationId,
        ...(beforeId && { id: { lt: beforeId } }),
      },
      orderBy: { id: 'desc' },
      take: limit,
      include: { user: true },
    });
  }

  async saveMessageDedup(msg: {
    consultationId: number;
    userId: number;
    content: string;
    clientUuid: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
  }) {
    return this.db.message.upsert({
      where: {
        clientUuid_consultationId_userId: {
          clientUuid: msg.clientUuid,
          consultationId: msg.consultationId,
          userId: msg.userId,
        },
      },
      create: {
        consultationId: msg.consultationId,
        userId: msg.userId,
        content: msg.content,
        clientUuid: msg.clientUuid,
        mediaUrl: msg.mediaUrl ?? null,
        mediaType: msg.mediaType ?? null,
      },
      update: {}, // ignore duplicates
    });
  }

  async upsertReadReceipts(userId: number, readMessageIds: number[]) {
    for (const messageId of readMessageIds) {
      await this.db.messageReadReceipt.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { readAt: new Date() },
        create: { messageId, userId, readAt: new Date() },
      });
    }
  }

  async saveSystemMessage(
    consultationId: number,
    content: string,
    role: UserRole,
  ): Promise<void> {
    try {
      await this.db.message.create({
        data: {
          consultationId,
          content,
          userId: 0, // no individual user for system messages
          isSystem: true,
          mediaType: null,
          mediaUrl: null,
          createdAt: new Date(),
          clientUuid: `system-${Date.now()}-${Math.random()}`,
        },
      });
      this.logger.log(
        `Saved system message for consultation ${consultationId}: ${content}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save system message for consultation ${consultationId}: ${error.message}`,
        error.stack,
      );
    }
  }

  async saveMediaPermissionStatus(
    consultationId: number,
    userId: number,
    status: { camera: string; microphone: string },
  ): Promise<void> {
    try {
      await this.db.mediaPermissionStatus.upsert({
        where: {
          consultationId_userId: { consultationId, userId },
        },
        create: {
          consultationId,
          userId,
          cameraStatus: status.camera,
          microphoneStatus: status.microphone,
          updatedAt: new Date(),
        },
        update: {
          cameraStatus: status.camera,
          microphoneStatus: status.microphone,
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Persisted media permission for consultation ${consultationId}, user ${userId}: cam=${status.camera}, mic=${status.microphone}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist media permission status for consultation ${consultationId}, user ${userId}`,
        error.stack,
      );
    }
  }
}
