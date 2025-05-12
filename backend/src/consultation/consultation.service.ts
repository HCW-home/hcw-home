import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service'; // adjust the path as needed
import { ConsultationStatus } from '@prisma/client';

@Injectable()
export class ConsultationService {
  constructor(private readonly db: DatabaseService) {}

  async joinAsPatient(consultationId: number, userId: number) {
    const participant = await this.db.upsertParticipant(consultationId, userId, true);
    return { participant };
  }

  async joinAsPractitioner(consultationId: number, userId: number) {
    const participant = await this.db.upsertParticipant(consultationId, userId, true);
    return { participant };
  }

  async getWaitingRoomConsultations(userId: number) {
    const consultations = await this.db.consultation.findMany({
      where: {
        status: ConsultationStatus.WAITING,
        participants: {
          some: {
            userId,
          },
        },
      },
      include: {
        participants: true,
      },
    });

    return consultations;
  }
}
