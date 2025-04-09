import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards,
  Query
} from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { 
  CreateConsultationDto, 
  UpdateConsultationDto, 
  UpdateConsultationStatusDto,
  BookingRequestDto
} from './dto/consultation.dto';
// We'll implement these guards later
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

@Controller('consultations')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @Post()
  // @UseGuards(JwtAuthGuard)
  create(@Body() createConsultationDto: CreateConsultationDto) {
    return this.consultationService.create(createConsultationDto);
  }

  @Get()
  // @UseGuards(JwtAuthGuard)
  findAll() {
    return this.consultationService.findAll();
  }

  @Get('patient/:patientId')
  // @UseGuards(JwtAuthGuard)
  findByPatientId(@Param('patientId') patientId: string) {
    return this.consultationService.findByPatientId(+patientId);
  }

  @Get('practitioner/:practitionerId')
  // @UseGuards(JwtAuthGuard)
  findByPractitionerId(@Param('practitionerId') practitionerId: string) {
    return this.consultationService.findByPractitionerId(+practitionerId);
  }

  @Get(':id')
  // @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.consultationService.findOne(+id);
  }

  @Patch(':id')
  // @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateConsultationDto: UpdateConsultationDto) {
    return this.consultationService.update(+id, updateConsultationDto);
  }

  @Patch(':id/status')
  // @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateConsultationStatusDto,
  ) {
    return this.consultationService.updateStatus(+id, updateStatusDto);
  }

  @Get(':id/join')
  // @UseGuards(JwtAuthGuard)
  generateJoinLink(@Param('id') id: string) {
    return this.consultationService.generateJoinLink(+id);
  }

  @Delete(':id')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.consultationService.remove(+id);
  }

  @Post('booking')
  // @UseGuards(JwtAuthGuard)
  createBookingRequest(@Body() bookingRequestDto: BookingRequestDto) {
    return this.consultationService.createBookingRequest(bookingRequestDto);
  }

  @Post('booking/:id/approve')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN', 'PRACTITIONER')
  approveBookingRequest(
    @Param('id') id: string,
    @Body() consultationData: CreateConsultationDto,
  ) {
    return this.consultationService.approveBookingRequest(+id, consultationData);
  }
}
