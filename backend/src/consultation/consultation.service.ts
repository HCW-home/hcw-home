import {
    ForbiddenException,
    Injectable,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationStatus } from '@prisma/client';
import { RecoverConsultationDto } from './dto/recover-consultation.dto';

@Injectable()
export class ConsultationService {
    private readonly logger = new Logger(ConsultationService.name);
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
     * Recover a consultation by sending a new magic link to the patient.
     * This is used when a patient has lost their invite link.
     * 
     * @param recoverData The email or phone number of the patient
     * @returns A generic success message regardless of outcome
     */
    async recoverConsultation(recoverData: RecoverConsultationDto) {
        try {
            // Find the user by phone number only (email isn't in the model)
            const user = await this.db.user.findFirst({
                where: {
                    phoneNumber: recoverData.phoneNumber || recoverData.email, // Try both values
                    role: 'Patient',
                },
                select: {
                    id: true,
                    phoneNumber: true,
                },
            });

            if (!user) {
                this.logger.debug('No patient found with the provided contact information');
                return { success: true, message: "If an active consultation exists, you'll receive a link shortly via SMS or email." };
            }

            // Find active consultations for this patient
            const activeConsultation = await this.db.consultation.findFirst({
                where: {
                    status: { in: [ConsultationStatus.SCHEDULED, ConsultationStatus.WAITING, ConsultationStatus.ACTIVE] },
                    participants: {
                        some: {
                            userId: user.id,
                        },
                    },
                },
                select: {
                    id: true,
                    messageService: true,
                },
            });

            if (!activeConsultation) {
                this.logger.debug(`No active consultation found for patient ${user.id}`);
                return { success: true, message: "If an active consultation exists, you'll receive a link shortly via SMS or email." };
            }

            // Generate and send magic link
            // This is a placeholder - actual implementation would depend on your notification system
            const magicLink = `https://yourdomain.com/join/${activeConsultation.id}?userId=${user.id}`;
            
            // Log the recovery attempt
            this.logger.log(`Consultation recovery requested for user ${user.id}, consultation ${activeConsultation.id}`);
            
            // In a real implementation, you would send the magic link via the preferred channel
            if (activeConsultation.messageService === 'EMAIL') {
                // Email option not available since User model doesn't have email
                this.logger.warn(`Email messaging configured but user has no email`);
                // Fall back to SMS or WhatsApp
                if (user.phoneNumber) {
                    this.logger.log(`Falling back to SMS for ${user.phoneNumber}`);
                    // smsService.sendMagicLink(user.phoneNumber, magicLink);
                }
            } else if (user.phoneNumber) {
                if (activeConsultation.messageService === 'WHATSAPP') {
                    // Send WhatsApp message with magic link
                    this.logger.log(`Sending recovery WhatsApp message to ${user.phoneNumber}`);
                    // whatsappService.sendMagicLink(user.phoneNumber, magicLink);
                } else {
                    // Default to SMS
                    this.logger.log(`Sending recovery SMS to ${user.phoneNumber}`);
                    // smsService.sendMagicLink(user.phoneNumber, magicLink);
                }
            }

            return { success: true, message: "If an active consultation exists, you'll receive a link shortly via SMS or email." };
        } catch (error) {
            // Log the error but still return generic success message
            this.logger.error(`Error during consultation recovery: ${error.message}`, error.stack);
            return { success: true, message: "If an active consultation exists, you'll receive a link shortly via SMS or email." };
        }
    }
}
