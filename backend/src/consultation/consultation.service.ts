import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationStatus, ParticipantRole } from '@prisma/client';
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
     * Adds a new participant (expert or guest) to a consultation
     * 
     * @param consultationId The ID of the consultation
     * @param userId The ID of the user to add
     * @param role The role of the participant (EXPERT or GUEST)
     * @param notes Optional notes about the participant
     * @returns The created participant with magic link
     */
    async addParticipant(consultationId: number, userId: number, role: ParticipantRole, notes?: string) {
        const consultation = await this.db.consultation.findUnique({ 
            where: { id: consultationId } 
        });
        
        if (!consultation) throw new NotFoundException('Consultation not found');

        const user = await this.db.user.findUnique({ 
            where: { id: userId } 
        });
        
        if (!user) throw new NotFoundException('User does not exist');

        // Generate a unique magic link
        const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/join/${consultationId}/${uuidv4()}`;

        const participant = await this.db.participant.upsert({
            where: { 
                consultationId_userId: { consultationId, userId } 
            },
            create: { 
                consultationId, 
                userId, 
                role, 
                notes, 
                magicLink,
                isActive: false
            },
            update: { 
                role, 
                notes,
                magicLink 
            },
        });

        return participant;
    }

    /**
     * Adds multiple participants to a consultation
     * 
     * @param consultationId The ID of the consultation
     * @param participants Array of participant data (userId, role, notes)
     * @returns Array of created participants with magic links
     */
    async addMultipleParticipants(consultationId: number, participants: Array<{userId: number, role: ParticipantRole, notes?: string}>) {
        const results = [];
        
        for (const participant of participants) {
            const result = await this.addParticipant(
                consultationId,
                participant.userId,
                participant.role,
                participant.notes
            );
            results.push(result);
        }
        
        return results;
    }

    /**
     * Joins a consultation as an expert or guest
     * 
     * @param consultationId The ID of the consultation
     * @param userId The ID of the user joining
     * @returns Object with success status and consultation ID
     */
    async joinAsParticipant(consultationId: number, userId: number) {
        const consultation = await this.db.consultation.findUnique({ 
            where: { id: consultationId },
            include: { 
                participants: { 
                    where: { userId } 
                } 
            }
        });
        
        if (!consultation) throw new NotFoundException('Consultation not found');

        const participant = consultation.participants[0];
        if (!participant) throw new NotFoundException('You are not invited to this consultation');

        // Only allow joining if the consultation is active or waiting
        if (consultation.status !== ConsultationStatus.WAITING && 
            consultation.status !== ConsultationStatus.ACTIVE) {
            throw new ForbiddenException('Consultation is not active or in waiting room');
        }

        await this.db.participant.update({
            where: { id: participant.id },
            data: { 
                isActive: true, 
                joinedAt: new Date() 
            },
        });

        return { success: true, consultationId };
    }

    /**
     * Get all participants for a consultation
     * 
     * @param consultationId The ID of the consultation
     * @returns Array of participants with user details
     */
    async getConsultationParticipants(consultationId: number) {
        const consultation = await this.db.consultation.findUnique({
            where: { id: consultationId },
            include: {
                participants: {
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
                }
            }
        });

        if (!consultation) throw new NotFoundException('Consultation not found');

        return consultation.participants;
    }

    /**
     * Creates a temporary user for an external participant and adds them to a consultation
     * 
     * @param consultationId The ID of the consultation
     * @param firstName First name of the participant
     * @param lastName Last name of the participant
     * @param contactInfo Phone number or email of the participant
     * @param role The role of the participant (EXPERT or GUEST)
     * @param notes Optional notes about the participant
     * @returns The created participant with magic link
     */
    async inviteExternalParticipant(
        consultationId: number, 
        firstName: string, 
        lastName: string, 
        contactInfo: string, 
        role: ParticipantRole, 
        notes?: string
    ) {
        const consultation = await this.db.consultation.findUnique({ 
            where: { id: consultationId } 
        });
        
        if (!consultation) throw new NotFoundException('Consultation not found');

        // Check if this is an email or phone number
        const isEmail = contactInfo.includes('@');
        const contactField = isEmail ? 'email' : 'phoneNumber';
        
        // Check if user already exists with this contact info
        let user = await this.db.user.findFirst({
            where: { phoneNumber: contactInfo }
        });
        
        // If user doesn't exist, create a temporary account
        if (!user) {
            // Generate a random password for temporary accounts
            const tempPassword = Math.random().toString(36).slice(-8);
            
            user = await this.db.user.create({
                data: {
                    firstName,
                    lastName,
                    phoneNumber: contactInfo, // Using phoneNumber as the unique identifier
                    password: tempPassword, // In a real system, this should be hashed
                    temporaryAccount: true,
                    country: 'Unknown', // Default values
                    language: 'en',
                    sex: 'other',
                    role: 'Patient', // Default role
                }
            });
        }
        
        // Now add them as a participant
        const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/join/${consultationId}/${uuidv4()}`;
        
        const participant = await this.db.participant.upsert({
            where: { 
                consultationId_userId: { consultationId, userId: user.id } 
            },
            create: { 
                consultationId, 
                userId: user.id, 
                role, 
                notes, 
                magicLink,
                isActive: false
            },
            update: { 
                role, 
                notes,
                magicLink 
            },
        });
        
        // In a real implementation, this would send an email or SMS
        // with the magic link to the participant
        console.log(`Invitation link for ${firstName}: ${magicLink}`);
        
        return {
            participant,
            user,
            magicLink,
            isNewUser: !user
        };
    }
}
