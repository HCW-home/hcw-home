import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConsultationService } from './consultation.service';
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
  ConsultationResponseDto,
} from './dto/create-consultation.dto';
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
import { ResponseStatus } from 'src/common/helpers/response/response-status.enum';
import {
  EndConsultationDto,
  EndConsultationResponseDto,
} from './dto/end-consultation.dto';

@ApiTags('consultation')
@Controller('consultation')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new consultation (practitioner/admin only)',
  })
  @ApiBody({ type: CreateConsultationDto })
  @ApiCreatedResponse({
    description: 'Consultation created',
    type: ApiResponseDto,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createConsultation(
    @Body() createDto: CreateConsultationDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<ApiResponseDto<ConsultationResponseDto>> {
    return this.consultationService.createConsultation(createDto, userId);
  }

  @Post(':id/join/patient')
  @ApiOperation({ summary: 'Patient joins a consultation' })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiBody({ type: JoinConsultationDto })
  @ApiOkResponse({
    description: 'Patient joined consultation',
    type: ApiResponseDto,
  })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async joinPatient(
    @Param('id', ConsultationIdParamPipe) id: number,
    @Body() body: JoinConsultationDto,
  ): Promise<ApiResponseDto<JoinConsultationResponseDto>> {
    return this.consultationService.joinAsPatient(id, body.userId);
  }

  @Post(':id/join/practitioner')
  @ApiOperation({ summary: 'Practitioner joins a consultation' })
  @ApiParam({ name: 'id', type: Number, description: 'Consultation ID' })
  @ApiBody({ type: JoinConsultationDto })
  @ApiOkResponse({
    description: 'Practitioner joined consultation',
    type: ApiResponseDto,
  })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async joinPractitioner(
    @Param('id', ConsultationIdParamPipe) id: number,
    @Body() body: JoinConsultationDto,
  ): Promise<ApiResponseDto<JoinConsultationResponseDto>> {
    return this.consultationService.joinAsPractitioner(id, body.userId);
  }

  @Post('/admit')
  @ApiOperation({
    summary: 'Admit a patient to a consultation (practitioner or admin only)',
  })
  @ApiBody({ type: AdmitPatientDto })
  @ApiOkResponse({
    description: 'Patient admitted to consultation',
    type: ApiResponseDto,
  })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async admitPatient(
    @Body() dto: AdmitPatientDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<ApiResponseDto<AdmitPatientResponseDto>> {
    return this.consultationService.admitPatient(dto, userId);
  }

  @Post('/end')
  @ApiOperation({ summary: 'End a consultation (practitioner or admin only)' })
  @ApiBody({ type: EndConsultationDto })
  @ApiOkResponse({
    description: 'Consultation ended',
    type: ApiResponseDto,
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async endConsultation(
    @Body() endDto: EndConsultationDto,
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<ApiResponseDto<EndConsultationResponseDto>> {
    return this.consultationService.endConsultation(endDto, userId);
  }

  @Get('/waiting-room')
  @ApiOperation({
    summary: 'Get waiting room consultations for a practitioner',
  })
  @ApiQuery({ name: 'userId', type: Number, description: 'Practitioner ID' })
  @ApiOkResponse({
    description: 'Waiting room consultations',
    type: ApiResponseDto,
  })
  async getWaitingRoom(
    @Query('userId', UserIdParamPipe) userId: number,
  ): Promise<ApiResponseDto<WaitingRoomPreviewResponseDto>> {
    return this.consultationService.getWaitingRoomConsultations(userId);
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
  @ApiOkResponse({ type: ApiResponseDto })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getHistory(
    @Query() query: HistoryQueryDto,
  ): Promise<ApiResponseDto<ConsultationHistoryItemDto[]>> {
    const data = await this.consultationService.getConsultationHistory(
      query.practitionerId,
      query.status,
    );
    return {
      success: true,
      status: ResponseStatus.SUCCESS,
      statusCode: HttpStatus.OK,
      message: 'Consultation history fetched successfully',
      timestamp: new Date().toISOString(),
      data,
    };
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Fetch full details of one consultation' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ApiResponseDto })
  async getDetails(
    @Param('id', ConsultationIdParamPipe) id: number,
  ): Promise<ApiResponseDto<ConsultationDetailDto>> {
    const data = await this.consultationService.getConsultationDetails(id);
    return {
      success: true,
      status: ResponseStatus.SUCCESS,
      statusCode: HttpStatus.OK,
      message: 'Consultation details fetched successfully',
      timestamp: new Date().toISOString(),
      data,
    };
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download consultation PDF' })
  @ApiParam({ name: 'id', type: Number })
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @Param('id', ConsultationIdParamPipe) id: number,
    @Res() res: Response,
  ) {
    const pdfBuffer =
      await this.consultationService.downloadConsultationPdf(id);
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Disposition': `attachment; filename="consultation_${id}.pdf"`,
      })
      .send(pdfBuffer);
  }
}
