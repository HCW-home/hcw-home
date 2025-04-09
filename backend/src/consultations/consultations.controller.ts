import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { QueryConsultationDto } from './dto/query-consultation.dto';

@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  create(@Body() createConsultationDto: CreateConsultationDto) {
    return this.consultationsService.create(createConsultationDto);
  }

  @Get()
  findAll(@Query() query: QueryConsultationDto) {
    return this.consultationsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consultationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateConsultationDto: UpdateConsultationDto,
  ) {
    return this.consultationsService.update(id, updateConsultationDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.consultationsService.remove(id);
  }

  @Get('practitioner/:practitionerId/history')
  getPractitionerHistory(
    @Param('practitionerId', ParseIntPipe) practitionerId: number,
    @Query() query: QueryConsultationDto,
  ) {
    return this.consultationsService.getPractitionerHistory(practitionerId, query);
  }
}
