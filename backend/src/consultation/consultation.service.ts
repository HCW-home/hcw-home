import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationStatus, MessageService } from '@prisma/client';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { MessageServiceDto, InvitationRoleDto } from './dto/create-invitation.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ConsultationService {
    constructor(private readonly db: DatabaseService) { }

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

    /**
     * Get messages for a consultation with pagination
     * @param consultationId The ID of the consultation
     * @param limit Maximum number of messages to return
     * @param before Message ID to fetch messages before (for pagination)
     * @returns Array of messages with sender info and read receipts
     */
    async getConsultationMessages(consultationId: number, limit: number = 50, before?: number) {
        const whereClause: any = { consultationId };
        
        // For pagination - get messages before a certain ID
        if (before) {
            whereClause.id = { lt: before };
        }
        
        return this.db.message.findMany({
            where: whereClause,
            include: {
                sender: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                role: true
                            }
                        }
                    }
                },
                readReceipts: {
                    include: {
                        participant: {
                            select: {
                                userId: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
    }

    /**
     * Create an invitation for a single expert/guest participant.
     */
    async createInvitation(consultationId: number, dto: CreateInvitationDto) {
        const consultation = await this.db.consultation.findUnique({ where: { id: consultationId } });
        if (!consultation) throw new NotFoundException('Consultation not found');

        const token = uuidv4();
        const invitation = await this.db.invitation.create({
            data: {
                consultationId,
                name: dto.name,
                contactValue: dto.contactValue,
                contactMethod: dto.contactMethod,
                role: dto.role,
                notes: dto.notes,
                token,
                sentAt: new Date(),
            },
        });
        const magicLink = `${process.env.APP_URL || 'http://localhost:3000'}/consultation/join/invite?token=${token}`;

        // Stub sending logic based on method
        switch (dto.contactMethod) {
            case MessageServiceDto.EMAIL:
                console.log(`Sending email to ${dto.contactValue}: ${magicLink}`);
                break;
            case MessageServiceDto.SMS:
                console.log(`Sending SMS to ${dto.contactValue}: ${magicLink}`);
                break;
            case MessageServiceDto.WHATSAPP:
                console.log(`Sending WhatsApp to ${dto.contactValue}: ${magicLink}`);
                break;
            case MessageServiceDto.MANUALLY:
                console.log(`Manual invite link for ${dto.contactValue}: ${magicLink}`);
                break;
        }

        return {
            name: invitation.name,
            contactValue: invitation.contactValue,
            role: invitation.role,
            magicLink,
        };
    }

    /**
     * Create multiple invitations for a consultation.
     */
    async createInvitations(consultationId: number, dtos: CreateInvitationDto[]): Promise<{ name: string; contactValue: string; role: InvitationRoleDto; magicLink: string; }[]> {
        const results: Array<{ name: string; contactValue: string; role: InvitationRoleDto; magicLink: string; }> = [];
        for (const dto of dtos) {
            const res = await this.createInvitation(consultationId, dto);
            results.push({...res, role: res.role as unknown as InvitationRoleDto});
        }
        return results;
    }

    /**
     * Participant joins the consultation via invitation token.
     */
    async joinInvited(token: string) {
        // Find invitation
        const invitation = await this.db.invitation.findUnique({ where: { token } });
        if (!invitation) throw new NotFoundException('Invalid invitation token');

        const { consultationId, contactMethod, contactValue } = invitation;
        let user: any = null;
        // Lookup user based on contact method
        switch (contactMethod) {
            case MessageServiceDto.EMAIL:
                user = await this.db.user.findFirst({ where: { email: contactValue } });
                break;
            case MessageServiceDto.SMS:
            case MessageServiceDto.WHATSAPP:
                user = await this.db.user.findFirst({ where: { phoneNumber: contactValue } });
                break;
            case MessageServiceDto.MANUALLY:
                const userId = parseInt(contactValue, 10);
                user = await this.db.user.findUnique({ where: { id: userId } });
                break;
            default:
                user = null;
        }
        if (!user) throw new NotFoundException('User not found for this invitation');

        // Upsert participant record
        const participant = await this.db.participant.upsert({
            where: { consultationId_userId: { consultationId, userId: user.id } },
            create: { consultationId, userId: user.id, isActive: true, joinedAt: new Date() },
            update: { isActive: true, joinedAt: new Date() },
            select: { id: true }
        });
        return { consultationId, participantId: participant.id, userId: user.id };
    }
}
