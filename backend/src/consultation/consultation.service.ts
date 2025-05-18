import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ConsultationGateway } from './consultation.gateway'; // ✅ Add this
import { ConsultationStatus } from '@prisma/client';

@Injectable()
export class ConsultationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: ConsultationGateway, // ✅ Inject gateway
  ) {}

  // ✅ Emit WebSocket event after patient joins
  async joinAsPatient(consultationId: number, userId: number) {
    const participant = await this.db.upsertParticipant(consultationId, userId, true);
    
    const user = await this.db.findUserById(userId);
    if (user?.role === 'Patient') {
      await this.gateway.notifyPractitioner({
        consultationId,
        patientName: user.firstName || 'Patient',
        joinedAt: new Date().toISOString(),
      });
    }

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
          some: { userId },
        },
      },
      include: { participants: true },
    });

    return consultations;
  }
}
