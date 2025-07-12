import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  ConsultationStatus,
  UserRole,
  Consultation,
  Participant,
  User,
  Message,
} from '@prisma/client';
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
import { AvailabilityService } from '../availability/availability.service';
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
  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly availabilityService: AvailabilityService,
    @Inject(forwardRef(() => ConsultationGateway))
    private readonly consultationGateway: ConsultationGateway,
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

    const ownerId = createDto.ownerId ?? userId;
    const practitioner = await this.db.user.findUnique({
      where: { id: ownerId },
    });
    if (!practitioner || practitioner.role !== UserRole.PRACTITIONER)
      throw HttpExceptionHelper.badRequest(
        'Owner must be a valid practitioner',
      );

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

    const createData = {
      owner: { connect: { id: ownerId } },
      scheduledDate: createDto.scheduledDate,
      createdBy: userId,
      status: ConsultationStatus.SCHEDULED,
      participants: {
        create: {
          userId: createDto.patientId,
          isActive: false,
          isBeneficiary: true,
        },
      },
      ...(typeof createDto.groupId === 'number' && {
        group: { connect: { id: createDto.groupId } },
      }),
    };
    const consultation = await this.db.consultation.create({
      data: createData,
      include: { participants: true },
    });

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
      select: { id: true, status: true, ownerId: true },
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

    const responsePayload: JoinConsultationResponseDto = {
      success: true,
      statusCode: 200,
      message: 'Patient joined consultation and entered waiting room.',
      consultationId,
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
        select: { id: true, ownerId: true, status: true },
      });
  
      if (!consultation) {
        throw HttpExceptionHelper.notFound('Consultation not found');
      }
  
      const practitioner = await this.db.user.findUnique({
        where: { id: practitionerId },
        select: { id: true },
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
      };
  
      const upsertedParticipant = await this.db.participant.upsert({
        where: {
          consultationId_userId: { consultationId, userId: practitionerId },
        },
        create: participantData,
        update: { isActive: true, joinedAt: new Date() },
      });
  
      const updatedConsultation = await this.db.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.ACTIVE },
      });
  
      if (this.consultationGateway.server) {
        try {
          this.consultationGateway.server
            .to(`consultation:${consultationId}`)
            .emit('consultation_status', {
              status: 'ACTIVE',
              initiatedBy: 'PRACTITIONER',
            });
        } catch (wsError) {
        }
      }
  
      const responsePayload: JoinConsultationResponseDto = {
        success: true,
        statusCode: 200,
        message: 'Practitioner joined and activated the consultation.',
        consultationId,
        sessionUrl: `/session/consultation/${consultationId}`,
      };
  
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

      if (this.consultationGateway.server) {
        try {
          this.consultationGateway.server
            .to(`consultation:${dto.consultationId}`)
            .emit('consultation_status', {
              status: 'ACTIVE',
              initiatedBy: user.role,
            });
        } catch (socketError) {
          console.error('WebSocket emission failed:', socketError);
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

  async getWaitingRoomConsultations(
    practitionerId: number,
  ): Promise<ApiResponseDto<WaitingRoomPreviewResponseDto>> {
    const practitioner = await this.db.user.findUnique({
      where: { id: practitionerId },
      select: { id: true },
    });
    if (!practitioner) {
      throw HttpExceptionHelper.notFound('User not found');
    }

    const consultations = await this.db.consultation.findMany({
      where: {
        status: ConsultationStatus.WAITING,
        ownerId: practitionerId,
        participants: {
          some: {
            isActive: true,
            user: { role: UserRole.PATIENT },
          },
        },
        NOT: {
          participants: {
            some: {
              isActive: true,
              user: { role: UserRole.PRACTITIONER },
            },
          },
        },
      },
      select: {
        id: true,
        participants: {
          where: {
            isActive: true,
            user: { role: UserRole.PATIENT },
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

    const waitingRooms = consultations.map((c) => {
      const patient = c.participants[0]?.user;
      return {
        id: c.id,
        patientInitials: patient
          ? `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`
          : '',
        joinTime: c.participants[0]?.joinedAt ?? null,
        language: patient?.country ?? null,
      };
    });

    const responsePayload = new WaitingRoomPreviewResponseDto({
      success: true,
      statusCode: 200,
      message: 'Waiting room consultations fetched.',
      waitingRooms,
      totalCount: waitingRooms.length,
    });

    return ApiResponseDto.success(
      responsePayload,
      responsePayload.message,
      responsePayload.statusCode,
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

      // Notify participants via WebSocket
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
        } catch (socketError) {
          console.error('WebSocket emission failed:', socketError);
        }
      }

      const responsePayload: EndConsultationResponseDto = {
        success: true,
        message,
        consultationId: endDto.consultationId,
        status: newStatus,
        deletionScheduledAt,
        retentionHours,
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
      console.error('Failed to end consultation:', error);
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
        consultationId: m.consultationId,
      })),
    };
  }

  async downloadConsultationPdf(id: number): Promise<Buffer> {
    const c = await this.db.consultation.findUnique({ where: { id } });
    if (!c) throw HttpExceptionHelper.notFound('Consultation not found');
    const dummyPdf = Buffer.from('%PDF-1.4\n%…', 'utf8');
    return dummyPdf;
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
}
