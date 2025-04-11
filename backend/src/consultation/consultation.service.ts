import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationStatus } from '@prisma/client';

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
}
