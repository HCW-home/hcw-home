import { Body, Controller, Get, Param, ParseIntPipe, Post, Request } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { RecoverConsultationDto } from './dto/recover-consultation.dto';

@Controller('consultation')
export class ConsultationController {

    constructor(private readonly consultationService: ConsultationService){}

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

    /**
     * Recovery endpoint for patients who have lost their invitation link.
     * Patients can provide either email or phone number to receive a new magic link.
     */
    @Post('/recover')
    async recoverConsultation(@Body() recoverData: RecoverConsultationDto) {
        return this.consultationService.recoverConsultation(recoverData);
    }
}
