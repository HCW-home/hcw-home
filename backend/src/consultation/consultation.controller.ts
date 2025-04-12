import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { PrismaService } from 'src/prisma.service'; // ✅ Import PrismaService

@Controller('consultation')
export class ConsultationController {
  constructor(
    private readonly consultationService: ConsultationService,
    private readonly prisma: PrismaService, // ✅ Inject PrismaService
  ) {}

  @Post('/')
  async createConsultation(@Body() body: any) {
    const consultation = await this.consultationService.createConsultation(body);
    return { message: 'Consultation created.', consultation };
  }

  @Post(':id/join/patient')
  async joinPatient(@Param('id', ParseIntPipe) id: number, @Body('userId') userId: number) {
    const res = await this.consultationService.joinAsPatient(id, userId);
    return { message: 'Patient joined consultation.', ...res };
  }

  @Post(':id/join/practitioner')
  async joinPractitioner(@Param('id', ParseIntPipe) id: number, @Body('userId') userId: number) {
    const res = await this.consultationService.joinAsPractitioner(id, userId);
    return { message: 'Practitioner joined consultation.', ...res };
  }

  @Get('/waiting-room')
  async getWaitingRoom(@Body('userId') userId: number) {
    const consultations = await this.consultationService.getWaitingRoomConsultations(userId);
    return { success: true, consultations };
  }

  // ✅ TEMPORARY ROUTE FOR TESTING REMINDER SYSTEM
  @Get('/test-create')
  async testCreateConsultation() {
    const now = new Date();
    const scheduledDate = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes in future

    const consultation = await this.prisma.consultation.create({
      data: {
        scheduledDate,
        createdAt: now,
        status: 'SCHEDULED',
        messageService: 'SMS', // or 'EMAIL' | 'WHATSAPP'
      },
    });

    return {
      message: '✅ Test consultation created. Check console logs in 3 minutes.',
      consultation,
    };
  }
}
