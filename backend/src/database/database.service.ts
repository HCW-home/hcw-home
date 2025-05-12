import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Participant, Consultation, Role } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    console.log('✅ Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    console.log('❌ Database connection closed');
  }

  /**
   * Upserts participant data, marking them as active or inactive.
   */
  async upsertParticipant(
    consultationId: number,
    userId: number,
    isActive: boolean,
  ): Promise<Participant> {
    return this.participant.upsert({
      where: { consultationId_userId: { consultationId, userId } },
      create: {
        consultationId,
        userId,
        isActive,
        joinedAt: new Date(),
      },
      update: {
        isActive,
      },
    });
  }

  /**
   * Finds active patients for a specific consultation.
   */
  async findActivePatients(consultationId: number): Promise<Participant[]> {
    return this.participant.findMany({
      where: {
        consultationId,
        isActive: true,
        user: { role: Role.Patient },
      },
    });
  }

  /**
   * Finds consultation details by ID.
   */
  async findConsultationById(
    consultationId: number,
  ): Promise<Consultation | null> {
    return this.consultation.findUnique({
      where: { id: consultationId },
    });
  }

  /**
   * Updates consultation status
   */
  async updateConsultationStatus(
    consultationId: number,
    status: Consultation['status'],
  ): Promise<Consultation> {
    return this.consultation.update({
      where: { id: consultationId },
      data: { status },
    });
  }
}
