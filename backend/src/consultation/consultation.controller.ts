import {  ParseIntPipe, Request } from '@nestjs/common';
import { Controller, Post, Body, Get, Param, HttpStatus, HttpException } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { MessageService as PrismaMessageService, Role, Prisma, Whatsapp_Template } from '@prisma/client';

export class ConsultationInviteDto {
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  language: string;
  messageService: PrismaMessageService;
  introMessage?: string;
  templateId?: string;
}

interface ConsultationInviteResponse {
  consultationId: string;
  magicLink?: string;
  success: boolean;
  message?: string;
}

@Controller('consultations')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

 @Post('invite')
 async createConsultationInvite(@Body() inviteDto: ConsultationInviteDto): Promise<ConsultationInviteResponse> {
    
    if (inviteDto.messageService === PrismaMessageService.EMAIL && !inviteDto.patientEmail) {
      throw new HttpException('Patient email is required for email invites', HttpStatus.BAD_REQUEST);
    }
    
    if ((inviteDto.messageService === PrismaMessageService.SMS || inviteDto.messageService === PrismaMessageService.WHATSAPP) 
        && !inviteDto.patientPhone) {
      throw new HttpException('Patient phone is required for SMS or WhatsApp invites', HttpStatus.BAD_REQUEST);
    }
    
    if (inviteDto.messageService === PrismaMessageService.WHATSAPP && !inviteDto.templateId) {
      throw new HttpException('Template ID is required for WhatsApp invites', HttpStatus.BAD_REQUEST);
    }
    
    try {
      const result = await this.consultationService.createConsultationWithInvite(inviteDto);
      return result;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create consultation invite',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('whatsapp-templates')
  async getWhatsAppTemplates(): Promise<Whatsapp_Template[]> {
    try {
      return await this.consultationService.getWhatsAppTemplates();
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve WhatsApp templates',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id/magic-link')
  async generateMagicLink(@Param('id') id: string) {
    try {
      return await this.consultationService.generateMagicLink(id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate magic link',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
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

}