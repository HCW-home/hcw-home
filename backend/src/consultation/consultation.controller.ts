import { Body, Controller, Get, Param, ParseIntPipe, Post, Request } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ReminderService } from 'src/reminder/reminder.service';

@Controller('consultation')
export class ConsultationController {

    constructor(private readonly consultationService: ConsultationService,
        private readonly reminderService: ReminderService,
    ){}

    @Post(':id/join/patient')
    async joinPatient(@Param('id', ParseIntPipe) id: number,  @Body('userId') userId: number,) {    
        const res = await this.consultationService.joinAsPatient(id, userId);

        return { message: 'Patient joined consultation.', ...res };
    }

    @Post(':id/join/practitioner')
    async joinPractitioner(@Param('id', ParseIntPipe) id: number,  @Body('userId') userId: number,) {
        const res = await this.consultationService.joinAsPractitioner(id, userId);

        return {message: 'Practitioner joined consultation. ', ...res}
    }

    @Get('/waiting-room')
    async getWaitingRoom(@Body('userId') userId: number) {
        const consultations = await this.consultationService.getWaitingRoomConsultations(userId);
        return {success: true, consultations};
    }


   
  async createTestConsultation() {
   
    const consultation = {
      id: 1,
      scheduledDate: new Date(new Date().getTime() + 60000), 
    };

    
    this.reminderService.scheduleReminderJob(consultation.id, consultation.scheduledDate, 30000, 'SMS'); 
  }

  @Post('create-test')
  async createTest() {
    await this.createTestConsultation();
    return { message: 'Test consultation created and reminder scheduled.' };
  }

}
