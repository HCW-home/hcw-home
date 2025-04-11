import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConsultationInviteDto } from './consultation.controller';
import { DatabaseService } from '../database/database.service';
import { 
  MessageService, 
  ConsultationStatus, 
  Whatsapp_Template,
  Role,
  Sex,
  Status
} from '@prisma/client';
import {
  ForbiddenException,
  
  NotFoundException,
} from '@nestjs/common';
// import { db } from 'src/database/database.service';
// import { ConsultationStatus } from '@prisma/client';

import * as crypto from 'crypto';

/**
 * Service handling consultation creation, management, and patient invitations
 */
@Injectable()
export class ConsultationService {
  constructor(private readonly db: DatabaseService) {}
  // constructor(private readonly db: db) { }
  /**
   * Creates a new consultation and sends an invite to the patient
   * @param inviteDto - Data for creating the consultation and sending the invite
   * @returns Object containing consultationId, magicLink, success status and message
   * @throws HttpException if consultation creation fails
   */
  async createConsultationWithInvite(inviteDto: ConsultationInviteDto) {
    try {
      const result = await this.db.$transaction(async (prisma) => {

        const consultation = await prisma.consultation.create({
          data: {
            status: ConsultationStatus.SCHEDULED,
            language: inviteDto.language,
            messageService: inviteDto.messageService,
            introMessage: inviteDto.introMessage,
            templateId: inviteDto.templateId,
          },
        });

        let patientUser: any = undefined;
        if (inviteDto.patientPhone) {
          patientUser = await prisma.user.findFirst({
            where: { 
              phoneNumber: inviteDto.patientPhone,
              role: Role.Patient
            }
          });
        }
        
        if (!patientUser) {
          patientUser = await prisma.user.create({
            data: {
              role: Role.Patient,
              firstName: inviteDto.patientName || 'Patient',
              lastName: '',
              password: 'temporary',
              temporaryAccount: true,
              phoneNumber: inviteDto.patientPhone || `patient-${Date.now()}`,
              country: 'Unknown',
              sex: Sex.other,
              status: Status.not_approved
            }
          });
          // console.log('Created new patient user:', patientUser.id);
        }
        
        let practitionerUser = await prisma.user.findFirst({
          where: { 
            role: Role.Practitioner
          }
        });
        
        if (!practitionerUser) {
          practitionerUser = await prisma.user.create({
            data: {
              role: Role.Practitioner,
              firstName: 'Practitioner',
              lastName: 'Default',
              password: 'practitioner',
              temporaryAccount: false,
              phoneNumber: `practitioner-${Date.now()}`,
              country: 'Unknown',
              sex: Sex.other,
              status: Status.approved
            }
          });
          // console.log('Created new practitioner user:', practitionerUser.id);
        }
        
        await prisma.participant.create({
          data: {
            consultationId: consultation.id,
            userId: patientUser.id
          },
        });
        
        await prisma.consultation.update({
          where: { id: consultation.id },
          data: { patientId: patientUser.id, owner: practitionerUser.id }
        });

        await prisma.participant.create({
          data: {
            consultationId: consultation.id,
            userId: practitionerUser.id
          },
        });
        
        await prisma.consultation.update({
          where: { id: consultation.id },
          data: { practitionerId: practitionerUser.id }
        });

        const linkData = await this.generateMagicLinkFromObject(consultation);
        const magicLink = linkData.link;
        
        await prisma.consultation.update({
          where: { id: consultation.id },
          data: { magicLink }
        });
        
        switch (inviteDto.messageService) {
          case MessageService.EMAIL:
            console.log(`Sending email to ${inviteDto.patientEmail} with magic link: ${magicLink}`);
            break;
            
          case MessageService.SMS:
            console.log(`Sending SMS to ${inviteDto.patientPhone} with magic link: ${magicLink}`);
            break;
            
          case MessageService.WHATSAPP:
            console.log(`Sending WhatsApp to ${inviteDto.patientPhone} using template ${inviteDto.templateId} with magic link: ${magicLink}`);
            break;
            
          case MessageService.MANUALLY:
            console.log(`Magic link for manual sharing: ${magicLink}`);
            break;
            
          default:
            throw new HttpException('Invalid send method', HttpStatus.BAD_REQUEST);
        }

        return {
          consultationId: consultation.id.toString(),
          magicLink,
          success: true,
          message: 'Consultation created successfully'
        };
      });

      return result;
    } catch (error) {
      console.error('Consultation creation error:', error);
      throw new HttpException(
        error.message || 'Failed to create consultation',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  /**
   * Generate a magic link for a patient to join a consultation
   * @param consultationId - ID of the consultation
   * @returns Object containing the generated magic link
   * @throws HttpException if the consultation is not found or link generation fails
   */
  async generateMagicLink(consultationId: string) {
    try {
      const consultation = await this.db.consultation.findUnique({
        where: { id: parseInt(consultationId, 10) }
      });
      
      if (!consultation) {
        throw new HttpException('Consultation not found', HttpStatus.NOT_FOUND);
      }
      
      return this.generateMagicLinkFromObject(consultation);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to generate magic link',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Generate a magic link from a consultation object (for use within transaction)
   * @param consultation - The consultation object to generate a link for
   * @returns Object containing the generated magic link
   * @throws HttpException if the consultation is not found or link generation fails
   */
  async generateMagicLinkFromObject(consultation: any) {
    try {
      if (!consultation) {
        throw new HttpException('Consultation not found', HttpStatus.NOT_FOUND);
      }
      
      const token = crypto.randomBytes(32).toString('hex');
      const link = `https://example.com/join/${consultation.uuid}?token=${token}`;
      
      return { link };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to generate magic link',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  /**
   * Get available WhatsApp templates
   * @returns Array of approved WhatsApp templates
   * @throws HttpException if templates cannot be retrieved
   */
  async getWhatsAppTemplates(): Promise<Whatsapp_Template[]> {
    try {
      return await this.db.whatsapp_Template.findMany({
        where: {
          approvalStatus: 'approved',
        },
      });
    } catch (error) {
      throw new HttpException(
        'Failed to get WhatsApp templates',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

 /**
     * Marks a consultation as WAITING when a patient hits the magic‑link.
     *
     * @param consultationId
     * @param patientId
     * @returns An object telling the success and the consulation Id
     * @throws NotFoundException if the consultation doesn't exist
    */
 async joinAsPatient(consultationId: number, patientId: number) {
  const consultation = await this.db.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundException('Consultation not found');

  const patient = await this.db.user.findUnique({ where: { id: patientId } });
  if (!patient) throw new NotFoundException('Patient does not exist');


  await this.db.participant.upsert({
      where: { consultationId_userId: { consultationId, userId: patientId } },
      create: { consultationId, userId: patientId, isActive: true, joinedAt: new Date() },
      update: { joinedAt: new Date() },
  });

  if (consultation.status === ConsultationStatus.SCHEDULED) {
      await this.db.consultation.update({
          where: { id: consultationId },
          data: { status: ConsultationStatus.WAITING },
      });
  }

  return { success: true, consultationId };
}


/**
* Marks a consultation as ACTIVE when the practitioner joins.
*
* @param consultationId
* @param practitionerId
* @returns An object telling the success and the consulation Id
* @throws NotFoundException if the consultation doesn't exist
* @throws ForbiddenException if the user is not the owner
*/
async joinAsPractitioner(consultationId: number, practitionerId: number) {
  const consultation = await this.db.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundException('Consultation not found');

  const practitioner = await this.db.user.findUnique({ where: { id: practitionerId } });
  if (!practitioner) throw new NotFoundException('Practitioner does not exist');

  if (consultation.owner !== practitionerId) {
      throw new ForbiddenException('Not the practitioner for this consultation');
  }

  await this.db.participant.upsert({
      where: { consultationId_userId: { consultationId, userId: practitionerId } },
      create: { consultationId, userId: practitionerId, isActive: true, joinedAt: new Date() },
      update: { joinedAt: new Date() },
  });

  await this.db.consultation.update({
      where: { id: consultationId },
      data: { status: ConsultationStatus.ACTIVE },
  });

  return { success: true, consultationId };
}

/**
* Fetches all consultations in WAITING for a practitioner,
* where patient has joined (isActive=true) but practitioner has not.
*/
async getWaitingRoomConsultations(practitionerId: number) {
  return this.db.consultation.findMany({
      where: {
          status: ConsultationStatus.WAITING,
          owner: practitionerId,
          participants: {
              some: {
                  isActive: true,
                  user: { role: 'Patient' },
              },
          },
          NOT: {
              participants: {
                  some: {
                      isActive: true,
                      user: { role: 'Practitioner' },
                  },
              },
          },
      },
      select: {
          id: true,
          scheduledDate: true,
          participants: {
              where: {
                  isActive: true,
                  user: { role: 'Patient' },
              },
              select: {
                  joinedAt: true,
                  user: {
                      select: {
                          firstName: true,
                          lastName: true,
                          country: true, // placeholder for language
                      },
                  },
              },
          },
      },
      orderBy: { scheduledDate: 'asc' },
  });
}


}

// @Injectable()
// export class ConsultationService {
 

   
// }
