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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  JoinConsultationDto,
  JoinConsultationResponseDto,
} from './dto/join-consultation.dto';
import { UserIdParamPipe } from './validation/user-id-param.pipe';
import { ConsultationIdParamPipe } from './validation/consultation-id-param.pipe';
import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';
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
  constructor(
    private readonly consultationService: ConsultationService,
    private readonly consultationMediaSoupService: ConsultationMediaSoupService,
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
    const result = await this.consultationService.joinAsPractitioner(
      id,
      body.userId,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
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
    summary:
      'Get waiting room consultations for a practitioner with pagination',
  })
  @ApiQuery({ name: 'userId', type: Number, description: 'Practitioner ID' })
  @ApiQuery({
    name: 'page',
    type: Number,
    required: false,
    description: 'Page number (default 1)',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    description: 'Items per page (default 10)',
  })
  @ApiQuery({
    name: 'sortOrder',
    enum: ['asc', 'desc'],
    required: false,
    description: 'Sort order by scheduledDate',
  })
  @ApiOkResponse({
    description: 'Waiting room consultations',
    type: ApiResponseDto<WaitingRoomPreviewResponseDto>,
  })
  async getWaitingRoom(
    @Query('userId', UserIdParamPipe) userId: number,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<any> {
    const result = await this.consultationService.getWaitingRoomConsultations(
      userId,
      page,
      limit,
      sortOrder,
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
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
      console.log(
        `PDF download request - Consultation ID: ${id}, Requester ID: ${requesterId}`,
      );

      const pdfBuffer = await this.consultationService.downloadConsultationPdf(
        id,
        requesterId,
      );

      console.log(
        `PDF generated successfully - Size: ${pdfBuffer.length} bytes`,
      );

      res
        .status(HttpStatus.OK)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="consultation_${id}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
        })
        .send(pdfBuffer);
    } catch (error) {
      console.error('PDF generation error:', error);

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
}
