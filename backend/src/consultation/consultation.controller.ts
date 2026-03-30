import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UsePipes,
  ValidationPipe,
  Query,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationMediaSoupService } from './consultation-mediasoup.service';
import { EnhancedRealtimeService } from './enhanced-realtime.service';
import { ChatService } from '../chat/chat.service';
import { MessageType } from '../chat/dto/create-message.dto';
import { WaitingRoomService } from './waiting-room.service';
import { UserRole } from '@prisma/client';
import {
  PractitionerWaitingRoomDto,
  JoinWaitingRoomDto,
  AdmitFromWaitingRoomDto,
  LiveConsultationJoinDto,
  LiveConsultationDataDto
} from './dto/waiting-room.dto';
import { CustomLoggerService } from 'src/logger/logger.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  JoinConsultationDto,
  JoinConsultationResponseDto,
} from './dto/join-consultation.dto';
import { UserIdParamPipe } from './validation/user-id-param.pipe';
import { ConsultationIdParamPipe } from './validation/consultation-id-param.pipe';
import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';
import {
  AdmitPatientDto,
  AdmitPatientResponseDto,
} from './dto/admit-patient.dto';
import {
  CreateConsultationDto,
  CreateConsultationWithTimeSlotDto,
  ConsultationResponseDto,
} from './dto/create-consultation.dto';
import { AssignPractitionerDto } from './dto/assign-practitioner.dto';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { HistoryQueryDto } from './dto/history-query.dto';
import { ConsultationHistoryItemDto } from './dto/consultation-history-item.dto';
import { ConsultationDetailDto } from './dto/consultation-detail.dto';
import { Response } from 'express';
import {
  EndConsultationDto,
  EndConsultationResponseDto,
} from './dto/end-consultation.dto';
import { ConsultationPatientHistoryItemDto } from './dto/consultation-patient-history.dto';
import { RateConsultationDto } from './dto/rate-consultation.dto';
import { CloseConsultationDto } from './dto/close-consultation.dto';
import { JoinOpenConsultationDto } from './dto/join-open-consultation.dto';
import {
  OpenConsultationResponseDto,
  OpenConsultationQueryDto,
} from './dto/open-consultation.dto';
import { ResponseStatus } from 'src/common/helpers/response/response-status.enum';
import { CreatePatientConsultationResponseDto } from './dto/invite-form.dto';
import { CreatePatientConsultationDto } from './dto/invite-form.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { SubmitFeedbackDto, FeedbackResponseDto } from './dto/submit-feedback.dto';
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
  CreateRealTimeEventDto,
  SendEnhancedMessageDto,
  RealtimeWaitingRoomStatsDto
} from './dto/realtime-input.dto';

@ApiTags('consultation')
@Controller('consultation')
@UseGuards(ThrottlerGuard)
export class ConsultationController {
  @Post(':consultationId/participants')
  @ApiOperation({ summary: 'Add a participant to a specific consultation' })
  @ApiBody({ type: AddParticipantDto })
  @ApiOkResponse({
    description: 'Participant added successfully',
    type: ApiResponseDto,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async addParticipantToConsultation(
    @Param('consultationId', ParseIntPipe) consultationId: number,
    @Body() addParticipantDto: AddParticipantDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    addParticipantDto.consultationId = consultationId;
    const result = await this.consultationService.addParticipantToConsultation(
      addParticipantDto,
      userId,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':consultationId/magic-link')
  @ApiOperation({ summary: 'Generate magic link for a participant during live consultation' })
  @ApiParam({ name: 'consultationId', type: Number, description: 'Consultation ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', description: 'Participant email address' },
        role: {
          type: 'string',
          enum: ['EXPERT', 'GUEST', 'PATIENT'],
          description: 'Participant role'
        },
        name: { type: 'string', description: 'Participant display name' },
        notes: { type: 'string', description: 'Optional notes for the participant' },
        expiresInMinutes: { type: 'number', default: 60, description: 'Link expiration in minutes' }
      },
      required: ['email', 'role', 'name']
    }
  })
  @ApiOkResponse({
    description: 'Magic link generated successfully',
    schema: {
      type: 'object',
      properties: {
        magicLink: { type: 'string', description: 'Generated magic link URL' },
        token: { type: 'string', description: 'Invitation token' },
        expiresAt: { type: 'string', format: 'date-time', description: 'Link expiration time' }
      }
    }
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async generateMagicLink(
    @Param('consultationId', ParseIntPipe) consultationId: number,
    @Body() body: {
      email: string;
      role: 'EXPERT' | 'GUEST' | 'PATIENT';
      name: string;
      notes?: string;
      expiresInMinutes?: number;
    },
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const result = await this.consultationService.generateMagicLinkForParticipant(
      consultationId,
      userId,
      body.email,
      body.role as any,
      body.name,
      body.notes,
      body.expiresInMinutes || 60,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }
  constructor(
    private readonly consultationService: ConsultationService,
    private readonly consultationMediaSoupService: ConsultationMediaSoupService,
    private readonly logger: CustomLoggerService,
    private readonly enhancedRealtimeService: EnhancedRealtimeService,
    private readonly chatService: ChatService,
    private readonly waitingRoomService: WaitingRoomService,
  ) { }

  @Post()
  @ApiOperation({
    summary: 'Create a new consultation (practitioner/admin only)',
  })
  @ApiBody({ type: CreateConsultationDto })
  @ApiCreatedResponse({
    description: 'Consultation created',
    type: ApiResponseDto<ConsultationResponseDto>,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  async createConsultation(
    @Body() createDto: CreateConsultationDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const result = await this.consultationService.createConsultation(
      createDto,
      userId,
    );
    return {
      ...ApiResponseDto.success(result.data, result.message, result.statusCode),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('with-timeslot')
  @ApiOperation({
    summary: 'Create a new consultation with time slot booking',
  })
  @ApiBody({ type: CreateConsultationWithTimeSlotDto })
  @ApiCreatedResponse({
    description: 'Consultation created with time slot booked',
    type: ApiResponseDto<ConsultationResponseDto>,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  async createConsultationWithTimeSlot(
    @Body() createDto: CreateConsultationWithTimeSlotDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const result =
      await this.consultationService.createConsultationWithTimeSlot(
        createDto,
        userId,
      );
    return {
      ...ApiResponseDto.success(result.data, result.message, result.statusCode),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('create-patient-consultation')
  @ApiOperation({
    summary:
      'Create patient and consultation from invite form (creates patient if not exists)',
  })
  @ApiBody({ type: CreatePatientConsultationDto })
  @ApiCreatedResponse({
    description: 'Patient and consultation created successfully',
    type: ApiResponseDto<CreatePatientConsultationResponseDto>,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  async createPatientAndConsultation(
    @Body() createDto: CreatePatientConsultationDto,
    @Query('practitionerId', UserIdParamPipe) practitionerId: number,
  ): Promise<any> {
    const result = await this.consultationService.createPatientAndConsultation(
      createDto,
      practitionerId,
    );
    return {
      ...ApiResponseDto.success(result.data, result.message, result.statusCode),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('join-by-token')
  @ApiOperation({ summary: 'Join a consultation using magic link token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        userId: { type: 'number' },
      },
      required: ['token'],
    },
  })
  @ApiOkResponse({
    description: 'Successfully joined consultation via token',
    type: ApiResponseDto<JoinConsultationResponseDto>,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async joinByToken(
    @Body() body: { token: string; userId?: number },
  ): Promise<any> {
    const result = await this.consultationService.joinConsultationByToken(
      body.token,
      body.userId,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':id/join/patient')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Patient joins a consultation' })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiBody({ type: JoinConsultationDto })
  @ApiOkResponse({
    description: 'Patient joined consultation',
    type: ApiResponseDto<JoinConsultationResponseDto>,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async joinPatient(
    @Param('id') id: number,
    @Body() body: JoinConsultationDto,
  ): Promise<any> {
    const result = await this.consultationService.joinAsPatient(
      id,
      body.userId,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':id/join/patient/smart')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Smart patient join - automatically determines if patient should go to waiting room or consultation room',
    description:
      'Handles patient rejoining logic: first-time via magic link goes to waiting room, dashboard rejoin goes directly to consultation if already admitted',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'number' },
        joinType: {
          type: 'string',
          enum: ['magic-link', 'dashboard', 'readmission'],
          description:
            'Type of join: magic-link (first time), dashboard (returning), readmission (after disconnection)',
        },
      },
      required: ['userId', 'joinType'],
    },
  })
  @ApiOkResponse({
    description: 'Patient joined consultation with appropriate state',
    type: ApiResponseDto<JoinConsultationResponseDto>,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async smartPatientJoin(
    @Param('id') id: number,
    @Body()
    body: {
      userId: number;
      joinType: 'magic-link' | 'dashboard' | 'readmission';
    },
  ): Promise<any> {
    const result = await this.consultationService.smartPatientJoin(
      id,
      body.userId,
      body.joinType,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':id/join/practitioner')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Practitioner joins a consultation' })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiBody({ type: JoinConsultationDto })
  @ApiOkResponse({
    description: 'Practitioner joined consultation',
    type: ApiResponseDto<JoinConsultationResponseDto>,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async joinPractitioner(
    @Param('id', ConsultationIdParamPipe) id: number,
    @Body() body: JoinConsultationDto,
  ): Promise<any> {
    try {
      const result = await this.consultationService.joinAsPractitioner(
        id,
        body.userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Successfully joined consultation',
        consultationId: id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[joinPractitioner] Error:', error);
      throw error;
    }
  }

  @Post('/admit')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Admit a patient to a consultation (practitioner or admin only)',
  })
  @ApiBody({ type: AdmitPatientDto })
  @ApiOkResponse({
    description: 'Patient admitted to consultation',
    type: ApiResponseDto<AdmitPatientResponseDto>,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async admitPatient(
    @Body() dto: AdmitPatientDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const result = await this.consultationService.admitPatient(dto, userId);
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('/end')
  @ApiOperation({ summary: 'End a consultation (practitioner or admin only)' })
  @ApiBody({ type: EndConsultationDto })
  @ApiOkResponse({
    description: 'Consultation ended',
    type: ApiResponseDto<EndConsultationResponseDto>,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  async endConsultation(
    @Body() endDto: EndConsultationDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const result = await this.consultationService.endConsultation(
      endDto,
      userId,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('/waiting-room')
  @ApiOperation({
    summary: 'Get practitioner waiting room with patients ready for consultation'
  })
  @ApiQuery({ name: 'userId', type: Number, description: 'Practitioner User ID' })
  @ApiQuery({ name: 'page', type: Number, required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Items per page (default 10)' })
  @ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false, description: 'Sort order' })
  @ApiOkResponse({ description: 'Practitioner waiting room data', type: PractitionerWaitingRoomDto })
  async getPractitionerWaitingRoom(
    @Query('userId', ParseIntPipe) userId: number,
    @Query('page', ParseIntPipe) page = 1,
    @Query('limit', ParseIntPipe) limit = 10,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<PractitionerWaitingRoomDto> {
    return this.waitingRoomService.getPractitionerWaitingRoom(
      userId,
      page,
      limit,
      sortOrder,
    );
  }

  @Get('/history')
  @ApiOperation({ summary: 'Fetch consultation history for a practitioner' })
  @ApiQuery({
    name: 'practitionerId',
    type: Number,
    description: 'Practitioner ID',
  })
  @ApiQuery({
    name: 'status',
    enum: ['COMPLETED', 'TERMINATED_OPEN'],
    required: false,
  })
  @ApiOkResponse({ type: ApiResponseDto<ConsultationHistoryItemDto[]> })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getHistory(@Query() query: HistoryQueryDto): Promise<any> {
    const result = await this.consultationService.getConsultationHistory(
      query.practitionerId,
      query.status,
    );
    return {
      ...ApiResponseDto.success(
        result,
        'Consultation history fetched successfully',
        HttpStatus.OK,
      ),
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Fetch full details of one consultation' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ApiResponseDto<ConsultationDetailDto> })
  async getDetails(
    @Param('id', ConsultationIdParamPipe) id: number,
  ): Promise<any> {
    const result = await this.consultationService.getConsultationDetails(id);
    return {
      ...ApiResponseDto.success(
        result,
        'Consultation details fetched successfully',
        HttpStatus.OK,
      ),
      timestamp: new Date().toISOString(),
    };
  }
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download consultation PDF' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({
    name: 'requesterId',
    type: Number,
    description: 'ID of requesting user',
  })
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @Param('id', ConsultationIdParamPipe) id: number,
    @Query('requesterId', ParseIntPipe) requesterId: number,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`PDF download request - Consultation ID: ${id}, Requester ID: ${requesterId}`);

      const pdfBuffer = await this.consultationService.downloadConsultationPdf(
        id,
        requesterId,
      );

      this.logger.log(`PDF generated successfully - Size: ${pdfBuffer.length} bytes`);

      res
        .status(HttpStatus.OK)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="consultation_${id}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
        })
        .send(pdfBuffer);
    } catch (error) {
      this.logger.error('PDF generation error:', error);

      if (error.status) {
        throw error;
      } else {
        throw new HttpException(
          `Failed to generate PDF: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  @Get('/patient/history')
  @ApiOperation({ summary: 'Fetch consultation history for a patient' })
  @ApiQuery({
    name: 'patientId',
    type: Number,
    description: 'Patient ID',
  })
  @ApiOkResponse({ type: ApiResponseDto<ConsultationPatientHistoryItemDto[]> })
  async getPatientHistory(
    @Query('patientId', UserIdParamPipe) patientId: number,
  ): Promise<any> {
    const consultations =
      await this.consultationService.getPatientConsultationHistory(patientId);
    return ApiResponseDto.success(
      consultations,
      'Patient consultation history fetched successfully',
      HttpStatus.OK,
    );
  }

  @Post('/patient/rate')
  @ApiOperation({ summary: 'Patient rates a completed consultation' })
  @ApiBody({ type: RateConsultationDto })
  @ApiOkResponse({ type: ApiResponseDto })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  async rateConsultation(
    @Query('patientId', UserIdParamPipe) patientId: number,
    @Body() dto: RateConsultationDto,
  ): Promise<any> {
    const result = await this.consultationService.rateConsultation(
      patientId,
      dto,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }
  @Get('/open')
  @ApiOperation({
    summary: 'Get all open (ongoing) consultations for a practitioner',
  })
  @ApiQuery({
    name: 'practitionerId',
    type: Number,
    description: 'Practitioner ID',
  })
  @ApiQuery({
    name: 'page',
    type: Number,
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    description: 'Items per page (default: 10)',
  })
  @ApiOkResponse({
    description: 'Open consultations fetched successfully',
    type: ApiResponseDto<OpenConsultationResponseDto>,
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getOpenConsultations(
    @Query('practitionerId', UserIdParamPipe) practitionerId: number,
    @Query() query: OpenConsultationQueryDto,
  ): Promise<ApiResponseDto<OpenConsultationResponseDto>> {
    return this.consultationService.getOpenConsultations(
      practitionerId,
      query.page,
      query.limit,
    );
  }

  @Post('/open/join')
  @ApiOperation({
    summary: 'Join an open consultation (rejoins existing session)',
  })
  @ApiBody({ type: JoinOpenConsultationDto })
  @ApiOkResponse({
    description: 'Successfully rejoined consultation',
    type: ApiResponseDto<JoinConsultationResponseDto>,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async joinOpenConsultation(
    @Body() dto: JoinOpenConsultationDto,
    @Query('practitionerId', UserIdParamPipe) practitionerId: number,
  ): Promise<ApiResponseDto<JoinConsultationResponseDto>> {
    return this.consultationService.joinAsPractitioner(
      dto.consultationId,
      practitionerId,
    );
  }
  @Post('/open/close')
  @ApiOperation({
    summary: 'Close an open consultation - Deprecated: Use /consultation/end',
    deprecated: true,
  })
  @ApiBody({ type: CloseConsultationDto })
  @ApiOkResponse({
    description: 'Consultation closed successfully',
    type: ApiResponseDto<EndConsultationResponseDto>,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async closeConsultation(
    @Body() dto: CloseConsultationDto,
    @Query('practitionerId', UserIdParamPipe) practitionerId: number,
  ): Promise<ApiResponseDto<EndConsultationResponseDto>> {
    const endDto: EndConsultationDto = {
      consultationId: dto.consultationId,
      action: 'close',
      reason: dto.reason,
    };

    return this.consultationService.endConsultation(endDto, practitionerId);
  }

  @Get('/open/:id/details')
  @ApiOperation({
    summary: 'Get detailed information about an open consultation',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Consultation ID',
  })
  @ApiOkResponse({
    description: 'Open consultation details fetched successfully',
    type: ApiResponseDto<ConsultationDetailDto>,
  })
  async getOpenConsultationDetails(
    @Param('id', ConsultationIdParamPipe) id: number,
    @Query('practitionerId', UserIdParamPipe) practitionerId: number,
  ): Promise<ApiResponseDto<ConsultationDetailDto>> {
    const data = await this.consultationService.getOpenConsultationDetails(
      id,
      practitionerId,
    );

    return {
      success: true,
      status: ResponseStatus.SUCCESS,
      statusCode: HttpStatus.OK,
      message: 'Open consultation details fetched successfully',
      timestamp: new Date().toISOString(),
      data,
    };
  }

  @Patch(':id/assign-practitioner')
  @ApiOperation({
    summary: 'Assign a practitioner to a draft consultation (admin only)',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Draft consultation ID' })
  @ApiBody({ type: AssignPractitionerDto })
  @ApiOkResponse({
    description: 'Practitioner assigned successfully',
    type: ApiResponseDto<ConsultationResponseDto>,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  @Patch(':id/assign-practitioner')
  async assignPractitioner(
    @Param('id', ConsultationIdParamPipe) consultationId: number,
    @Body() body: AssignPractitionerDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const updatedConsultation =
      await this.consultationService.assignPractitionerToConsultation(
        consultationId,
        body.practitionerId,
        userId,
      );

    return {
      ...ApiResponseDto.success(
        updatedConsultation,
        'Practitioner assigned successfully',
      ),
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':id/self-assign')
  @ApiOperation({
    summary: 'Self-assign a consultation (practitioner only)',
    description: 'Allows a practitioner to claim an unassigned consultation from their waiting room',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiQuery({ name: 'practitionerId', type: Number, description: 'Practitioner User ID' })
  @ApiOkResponse({
    description: 'Consultation self-assigned successfully',
    type: ApiResponseDto<ConsultationResponseDto>,
  })
  async selfAssignConsultation(
    @Param('id', ConsultationIdParamPipe) consultationId: number,
    @Query('practitionerId', UserIdParamPipe) practitionerId: number,
  ): Promise<any> {
    const result = await this.consultationService.selfAssignConsultation(
      consultationId,
      practitionerId,
    );

    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  // ===================================================================
  // ENHANCED MEDIASOUP INTEGRATION ENDPOINTS
  // ===================================================================

  @Get(':id/participants/media-status')
  @ApiOperation({
    summary: 'Get participants with MediaSoup session status',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiOkResponse({
    description: 'Participants with media status retrieved successfully',
  })
  async getParticipantsWithMediaStatus(
    @Param('id', ParseIntPipe) consultationId: number,
  ) {
    const result =
      await this.consultationMediaSoupService.getActiveParticipantsWithMediaStatus(
        consultationId,
      );

    return ApiResponseDto.success(
      result,
      'Participants with media status retrieved successfully',
    );
  }

  @Get(':id/health-check')
  @ApiOperation({
    summary: 'Get comprehensive health check including MediaSoup status',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiOkResponse({
    description: 'Consultation health status retrieved successfully',
  })
  async getConsultationHealthCheck(
    @Param('id', ParseIntPipe) consultationId: number,
  ) {
    const result =
      await this.consultationMediaSoupService.getConsultationHealthStatus(
        consultationId,
      );

    return ApiResponseDto.success(
      result,
      'Consultation health status retrieved successfully',
    );
  }

  @Post(':id/participants/:userId/join-media')
  @ApiOperation({
    summary: 'Handle participant joining MediaSoup session',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiParam({ name: 'userId', type: Number, description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userRole: {
          type: 'string',
          enum: ['PATIENT', 'PRACTITIONER', 'EXPERT', 'GUEST'],
        },
      },
      required: ['userRole'],
    },
  })
  @ApiOkResponse({
    description: 'Participant media join handled successfully',
  })
  async handleParticipantJoinMedia(
    @Param('id', ParseIntPipe) consultationId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { userRole: string },
  ) {
    const result =
      await this.consultationMediaSoupService.handleParticipantJoinMedia(
        consultationId,
        userId,
        body.userRole as any,
      );

    return ApiResponseDto.success(
      result,
      'Participant media join handled successfully',
    );
  }

  @Post(':id/participants/:userId/leave-media')
  @ApiOperation({
    summary: 'Handle participant leaving MediaSoup session',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiParam({ name: 'userId', type: Number, description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userRole: {
          type: 'string',
          enum: ['PATIENT', 'PRACTITIONER', 'EXPERT', 'GUEST'],
        },
      },
      required: ['userRole'],
    },
  })
  @ApiOkResponse({
    description: 'Participant media leave handled successfully',
  })
  async handleParticipantLeaveMedia(
    @Param('id', ParseIntPipe) consultationId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { userRole: string },
  ) {
    await this.consultationMediaSoupService.handleParticipantLeaveMedia(
      consultationId,
      userId,
      body.userRole as any,
    );

    return ApiResponseDto.success(
      { success: true },
      'Participant media leave handled successfully',
    );
  }

  @Patch(':id/transition-state')
  @ApiOperation({
    summary: 'Transition consultation state with MediaSoup coordination',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newStatus: {
          type: 'string',
          enum: [
            'DRAFT',
            'SCHEDULED',
            'WAITING',
            'ACTIVE',
            'COMPLETED',
            'CANCELLED',
            'TERMINATED_OPEN',
          ],
        },
        initiatorUserId: { type: 'number' },
      },
      required: ['newStatus', 'initiatorUserId'],
    },
  })
  @ApiOkResponse({
    description: 'Consultation state transitioned successfully',
  })
  async transitionConsultationState(
    @Param('id', ParseIntPipe) consultationId: number,
    @Body() body: { newStatus: string; initiatorUserId: number },
  ) {
    await this.consultationMediaSoupService.transitionConsultationState(
      consultationId,
      body.newStatus as any,
      body.initiatorUserId,
    );

    return ApiResponseDto.success(
      { success: true },
      'Consultation state transitioned successfully',
    );
  }

  @Post(':id/initialize-media-session')
  @ApiOperation({
    summary: 'Initialize MediaSoup session for consultation',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        initiatorUserId: { type: 'number' },
        initiatorRole: {
          type: 'string',
          enum: ['PATIENT', 'PRACTITIONER', 'EXPERT', 'GUEST'],
        },
      },
      required: ['initiatorUserId', 'initiatorRole'],
    },
  })
  @ApiOkResponse({
    description: 'MediaSoup session initialized successfully',
  })
  async initializeMediaSoupSession(
    @Param('id', ParseIntPipe) consultationId: number,
    @Body() body: { initiatorUserId: number; initiatorRole: string },
  ) {
    const result =
      await this.consultationMediaSoupService.initializeMediaSoupSession(
        consultationId,
        body.initiatorUserId,
        body.initiatorRole as any,
      );

    return ApiResponseDto.success(
      result,
      'MediaSoup session initialized successfully',
    );
  }

  @Get(':id/session-status')
  @ApiOperation({ summary: 'Get current session status for a consultation' })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiOkResponse({
    description: 'Current session status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        consultationId: { type: 'number' },
        status: {
          type: 'string',
          enum: ['waiting', 'active', 'completed', 'cancelled'],
          description: 'Current consultation status'
        },
        currentStage: {
          type: 'string',
          enum: ['waiting_room', 'consultation_room', 'completed'],
          description: 'Current stage of consultation'
        },
        redirectTo: {
          type: 'string',
          enum: ['waiting-room', 'consultation-room'],
          description: 'Where patient should be redirected'
        },
        waitingRoomUrl: { type: 'string', description: 'URL for waiting room' },
        consultationRoomUrl: { type: 'string', description: 'URL for consultation room' },
        estimatedWaitTime: { type: 'number', description: 'Estimated wait time in minutes' },
        isActive: { type: 'boolean', description: 'Whether consultation is currently active' },
        lastUpdated: { type: 'string', description: 'Last update timestamp' },
        practitionerPresent: { type: 'boolean', description: 'Whether practitioner is present' },
        queuePosition: { type: 'number', description: 'Position in waiting queue' }
      }
    }
  })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async getSessionStatus(
    @Param('id', ConsultationIdParamPipe) consultationId: number,
  ) {
    const sessionStatus = await this.consultationService.getSessionStatus(consultationId);
    return ApiResponseDto.success(
      sessionStatus,
      'Session status retrieved successfully',
    );
  }

  @Post('/feedback')
  @ApiOperation({ summary: 'Submit feedback for a consultation' })
  @ApiBody({ type: SubmitFeedbackDto })
  @ApiOkResponse({
    description: 'Feedback submitted successfully',
    type: ApiResponseDto<FeedbackResponseDto>,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  async submitFeedback(
    @Body() dto: SubmitFeedbackDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const result = await this.consultationService.submitFeedback(dto, userId);
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id/feedback')
  @ApiOperation({ summary: 'Get feedback for a consultation' })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiOkResponse({
    description: 'Feedback retrieved successfully',
    type: ApiResponseDto<FeedbackResponseDto>,
  })
  async getFeedback(
    @Param('id', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<any> {
    const result = await this.consultationService.getFeedback(
      consultationId,
      userId,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }


  @Get(':consultationId/waiting-room/sessions')
  @ApiOperation({ summary: 'Get waiting room sessions for a consultation' })
  @ApiOkResponse({ description: 'Waiting room sessions retrieved successfully', type: [WaitingRoomSessionDto] })
  async getWaitingRoomSessions(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number
  ): Promise<WaitingRoomSessionDto[]> {
    return this.waitingRoomService.getWaitingRoomSessions(consultationId);
  }

  @Post(':consultationId/waiting-room/enter')
  @ApiOperation({ summary: 'Enter waiting room for a consultation' })
  @ApiOkResponse({ description: 'Successfully entered waiting room', type: WaitingRoomSessionDto })
  async enterWaitingRoom(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number
  ): Promise<WaitingRoomSessionDto> {
    return this.enhancedRealtimeService.enterWaitingRoom(consultationId, userId);
  }

  @Get(':consultationId/waiting-room/stats')
  @ApiOperation({ summary: 'Get waiting room statistics' })
  @ApiOkResponse({ description: 'Waiting room stats retrieved successfully', type: RealtimeWaitingRoomStatsDto })
  async getWaitingRoomStats(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number
  ): Promise<RealtimeWaitingRoomStatsDto> {
    return this.waitingRoomService.getWaitingRoomStats(consultationId);
  }

  @Get(':consultationId/media-device-status')
  @ApiOperation({ summary: 'Get media device status for user in consultation' })
  @ApiOkResponse({ description: 'Media device status retrieved successfully', type: MediaDeviceStatusDto })
  async getMediaDeviceStatus(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number
  ): Promise<MediaDeviceStatusDto | null> {
    return this.enhancedRealtimeService.getMediaDeviceStatus(consultationId, userId);
  }

  @Patch(':consultationId/media-device-status')
  @ApiOperation({ summary: 'Update media device status' })
  @ApiOkResponse({ description: 'Media device status updated successfully', type: MediaDeviceStatusDto })
  async updateMediaDeviceStatus(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number,
    @Body() updateDto: UpdateMediaDeviceStatusDto
  ): Promise<MediaDeviceStatusDto> {
    return this.enhancedRealtimeService.updateMediaDeviceStatus(consultationId, userId, updateDto);
  }

  @Post(':consultationId/connection-quality')
  @ApiOperation({ summary: 'Update connection quality metrics' })
  @ApiOkResponse({ description: 'Connection quality updated successfully', type: ConnectionQualityDto })
  async updateConnectionQuality(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number,
    @Body() updateDto: UpdateConnectionQualityDto
  ): Promise<ConnectionQualityDto> {
    return this.enhancedRealtimeService.updateConnectionQuality(consultationId, userId, updateDto);
  }

  @Get(':consultationId/connection-quality/history')
  @ApiOperation({ summary: 'Get connection quality history for user' })
  @ApiOkResponse({ description: 'Connection quality history retrieved successfully', type: [ConnectionQualityDto] })
  async getConnectionQualityHistory(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number
  ): Promise<ConnectionQualityDto[]> {
    return this.enhancedRealtimeService.getConnectionQualityHistory(consultationId, userId);
  }

  @Get(':consultationId/events')
  @ApiOperation({ summary: 'Get real-time events for consultation' })
  @ApiOkResponse({ description: 'Real-time events retrieved successfully', type: [RealTimeEventDto] })
  async getRealTimeEvents(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('limit') limit?: number
  ): Promise<RealTimeEventDto[]> {
    return this.enhancedRealtimeService.getRealTimeEvents(consultationId, limit);
  }

  @Post(':consultationId/events')
  @ApiOperation({ summary: 'Create a real-time event' })
  @ApiCreatedResponse({ description: 'Real-time event created successfully', type: RealTimeEventDto })
  async createRealTimeEvent(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number,
    @Body() createDto: CreateRealTimeEventDto
  ): Promise<RealTimeEventDto> {
    return this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, createDto);
  }

  @Post(':consultationId/messages')
  @ApiOperation({ summary: 'Send an enhanced message' })
  @ApiCreatedResponse({ description: 'Message sent successfully' })
  async sendEnhancedMessage(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Query('userId', UserIdParamPipe) userId: number,
    @Body() messageDto: SendEnhancedMessageDto
  ): Promise<any> {
    // Convert SendEnhancedMessageDto to CreateMessageDto format
    const createMessageDto = {
      userId,
      consultationId,
      content: messageDto.content,
      messageType: (messageDto.messageType as MessageType) || MessageType.TEXT,
      mediaUrl: messageDto.mediaUrl,
      fileName: messageDto.fileName,
      fileSize: messageDto.fileSize,
      clientUuid: `msg_${Date.now()}_${userId}` // Generate client UUID
    };

    const message = await this.chatService.createMessage(createMessageDto);

    // Create real-time event for the message
    await this.enhancedRealtimeService.createRealTimeEvent(consultationId, userId, {
      eventType: 'new_message',
      eventData: {
        messageId: message.id,
        messageType: message.messageType,
        hasMedia: !!message.mediaUrl
      }
    });

    return message;
  }

  @Patch(':consultationId/messages/:messageId/read')
  @ApiOperation({ summary: 'Mark message as read' })
  @ApiOkResponse({ description: 'Message marked as read successfully' })
  async markMessageAsRead(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Query('userId', UserIdParamPipe) userId: number
  ): Promise<any> {
    const readMessageDto = {
      messageId,
      userId,
      consultationId
    };
    const result = await this.chatService.markMessageAsRead(readMessageDto);
    return { message: 'Message marked as read', data: result };
  }

  @Get(':consultationId/typing-indicators')
  @ApiOperation({ summary: 'Get current typing indicators' })
  @ApiOkResponse({ description: 'Typing indicators retrieved successfully', type: [TypingIndicatorDto] })
  async getTypingIndicators(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number
  ): Promise<TypingIndicatorDto[]> {
    return this.enhancedRealtimeService.getTypingIndicators(consultationId);
  }

  @Get(':consultationId/enhanced/health')
  @ApiOperation({ summary: 'Get enhanced consultation health status' })
  @ApiOkResponse({
    description: 'Health status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        consultationId: { type: 'number' },
        timestamp: { type: 'string', format: 'date-time' },
        activeFeatures: { type: 'array', items: { type: 'string' } },
        waitingRoomSessions: { type: 'array', items: { $ref: '#/components/schemas/WaitingRoomSessionDto' } },
        recentEvents: { type: 'array', items: { $ref: '#/components/schemas/RealTimeEventDto' } }
      }
    }
  })
  async getEnhancedConsultationHealth(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number
  ): Promise<{
    status: string;
    consultationId: number;
    timestamp: string;
    activeFeatures: string[];
    waitingRoomSessions: WaitingRoomSessionDto[];
    recentEvents: RealTimeEventDto[];
  }> {
    const sessions = await this.waitingRoomService.getWaitingRoomSessions(consultationId);
    const events = await this.enhancedRealtimeService.getRealTimeEvents(consultationId, 1);

    return {
      status: 'healthy',
      consultationId,
      timestamp: new Date().toISOString(),
      activeFeatures: [
        'waiting_room',
        'real_time_events',
        'enhanced_messaging',
        'media_device_status',
        'connection_quality'
      ],
      waitingRoomSessions: sessions,
      recentEvents: events
    };
  }

  @Get(':consultationId/enhanced/participants/status')
  @ApiOperation({ summary: 'Get comprehensive participant status' })
  @ApiOkResponse({ description: 'Participant status retrieved successfully' })
  async getParticipantsStatus(
    @Param('consultationId', ConsultationIdParamPipe) consultationId: number
  ): Promise<any> {
    const [sessions, events] = await Promise.all([
      this.waitingRoomService.getWaitingRoomSessions(consultationId),
      this.enhancedRealtimeService.getRealTimeEvents(consultationId, 10)
    ]);

    return {
      consultationId,
      waitingRoomSessions: sessions,
      recentEvents: events,
      timestamp: new Date().toISOString()
    };
  }


  @Post('/waiting-room/join')
  @ApiOperation({ summary: 'Patient joins waiting room via magic link' })
  @ApiCreatedResponse({ description: 'Successfully joined waiting room' })
  async joinWaitingRoom(@Body() dto: JoinWaitingRoomDto): Promise<{ success: boolean; waitingRoomSession: any }> {
    return this.waitingRoomService.joinWaitingRoom(dto);
  }

  @Post('/waiting-room/admit')
  @ApiOperation({ summary: 'Practitioner admits patient from waiting room to live consultation' })
  @ApiCreatedResponse({ description: 'Patient successfully admitted to live consultation' })
  async admitPatientFromWaitingRoom(
    @Body() dto: AdmitFromWaitingRoomDto,
    @Query('practitionerId', ParseIntPipe) practitionerId: number
  ): Promise<{ success: boolean }> {
    return this.waitingRoomService.admitPatientFromWaitingRoom(dto, practitionerId);
  }

  @Post('/live/join')
  @ApiOperation({ summary: 'Join live consultation (practitioner/expert/guest)' })
  @ApiCreatedResponse({ description: 'Successfully joined live consultation', type: LiveConsultationDataDto })
  async joinLiveConsultation(@Body() dto: LiveConsultationJoinDto): Promise<LiveConsultationDataDto> {
    return this.waitingRoomService.joinLiveConsultation(dto);
  }

  @Post(':consultationId/test-patient-joined')
  @ApiOperation({ summary: 'Test patient joined notification (for development only)' })
  @ApiParam({ name: 'consultationId', type: Number, description: 'Consultation ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        patientFirstName: { type: 'string', default: 'Test Patient' },
        practitionerId: { type: 'number', description: 'Target practitioner ID' }
      },
      required: ['practitionerId']
    }
  })
  @ApiOkResponse({ description: 'Test patient joined event emitted successfully' })
  async testPatientJoinedEvent(
    @Param('consultationId', ParseIntPipe) consultationId: number,
    @Body() body: { patientFirstName?: string; practitionerId: number }
  ): Promise<{ success: boolean; message: string }> {
    const patientFirstName = body.patientFirstName || 'Test Patient';

    // Use the consultation service to emit test event
    const result = await this.consultationService.testEmitPatientJoined(
      consultationId,
      body.practitionerId,
      patientFirstName
    );

    return {
      success: true,
      message: `Test patient_joined event sent to practitioner ${body.practitionerId} for consultation ${consultationId}`
    };
  }

  /**
   * Generate initials from name for testing
   */
  private generateInitials(name: string): string {
    if (!name) return 'P';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
}
