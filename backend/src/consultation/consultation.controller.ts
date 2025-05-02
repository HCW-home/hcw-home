import { Body, Controller, Get, Param, ParseIntPipe, Post, Request } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ParticipantRole } from '@prisma/client';

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

    @Post(':id/join/participant')
    async joinAsParticipant(@Param('id', ParseIntPipe) id: number, @Body('userId') userId: number) {
        const res = await this.consultationService.joinAsParticipant(id, userId);

        return { message: 'Participant joined consultation.', ...res };
    }

    @Post(':id/participants')
    async addParticipant(
        @Param('id', ParseIntPipe) id: number,
        @Body('userId') userId: number,
        @Body('role') role: ParticipantRole,
        @Body('notes') notes?: string
    ) {
        const participant = await this.consultationService.addParticipant(id, userId, role, notes);
        return { 
            message: 'Participant added to consultation.', 
            success: true, 
            participant 
        };
    }

    @Post(':id/participants/batch')
    async addMultipleParticipants(
        @Param('id', ParseIntPipe) id: number,
        @Body('participants') participants: Array<{userId: number, role: ParticipantRole, notes?: string}>
    ) {
        const results = await this.consultationService.addMultipleParticipants(id, participants);
        return { 
            message: 'Multiple participants added to consultation.', 
            success: true, 
            participants: results 
        };
    }

    @Get(':id/participants')
    async getConsultationParticipants(@Param('id', ParseIntPipe) id: number) {
        const participants = await this.consultationService.getConsultationParticipants(id);
        return { success: true, participants };
    }

    @Get('/waiting-room')
    async getWaitingRoom(@Body('userId') userId: number) {
        const consultations = await this.consultationService.getWaitingRoomConsultations(userId);
        return {success: true, consultations};
    }

    @Post(':id/participants/invite')
    async inviteExternalParticipant(
        @Param('id', ParseIntPipe) id: number,
        @Body('firstName') firstName: string,
        @Body('lastName') lastName: string,
        @Body('contactInfo') contactInfo: string,
        @Body('role') role: ParticipantRole,
        @Body('notes') notes?: string
    ) {
        const result = await this.consultationService.inviteExternalParticipant(
            id, 
            firstName, 
            lastName, 
            contactInfo, 
            role, 
            notes
        );
        
        return { 
            message: 'External participant invited to consultation.', 
            success: true, 
            ...result
        };
    }

    @Post(':id/participants/invite/batch')
    async inviteMultipleExternalParticipants(
        @Param('id', ParseIntPipe) id: number,
        @Body('participants') participants: Array<{
            firstName: string,
            lastName: string,
            contactInfo: string,
            role: ParticipantRole,
            notes?: string
        }>
    ) {
        const results = [];
        
        for (const participant of participants) {
            const result = await this.consultationService.inviteExternalParticipant(
                id,
                participant.firstName,
                participant.lastName,
                participant.contactInfo,
                participant.role,
                participant.notes
            );
            results.push(result);
        }
        
        return { 
            message: 'Multiple external participants invited to consultation.', 
            success: true, 
            results 
        };
    }
}
