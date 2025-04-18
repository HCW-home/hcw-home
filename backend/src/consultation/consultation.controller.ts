import {
    Controller,
    Post,
    Body,
    Param,
    Get,
} from '@nestjs/common';
import { ConsultationService } from './consultation.service';

@Controller('consultation')
export class ConsultationController {
    constructor(private readonly consultationService: ConsultationService) { }

    @Post(':consultationId/join-as-patient/:patientId')
    async joinAsPatient(@Param('consultationId') consultationId: string, @Param('patientId') patientId: string) {
        const res = await this.consultationService.joinAsPatient(Number(consultationId), Number(patientId));
        return { message: 'Patient joined consultation.', ...res };
    }

    @Post(':consultationId/join-as-practitioner/:practitionerId')
    async joinAsPractitioner(@Param('consultationId') consultationId: string, @Param('practitionerId') practitionerId: string) {
        const res = await this.consultationService.joinAsPractitioner(Number(consultationId), Number(practitionerId));
        return {message: 'Practitioner joined consultation. ', ...res}
    }

    @Get(':consultationId/session')
    async getConsultationSession(@Param('consultationId') consultationId: string) {
        const session = await this.consultationService.getConsultationSession(Number(consultationId));
        return session;
    }

    @Get('waiting-room/:practitionerId')
    async getWaitingRoomConsultations(@Param('practitionerId') practitionerId: string) {
        return this.consultationService.getWaitingRoomConsultations(Number(practitionerId));
    }
}
