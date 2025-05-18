import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma, MessageType } from '@prisma/client';

@Injectable()
export class DatabaseService extends PrismaClient {
  private _messageRead: any;
  public get messageRead(): any {
    return this._messageRead;
  }
  public set messageRead(value: any) {
    this._messageRead = value;
  }
  private _message: any;
  public get message(): any {
    return this._message;
  }
  public set message(value: any) {
    this._message = value;
  }
  async upsertParticipant(consultationId: number, userId: number, isActive: boolean) {
    return this.participant.upsert({
      where: {
        consultationId_userId: { consultationId, userId },
      },
      update: {
        isActive,
        joinedAt: isActive ? new Date() : undefined,
      },
      create: {
        consultationId,
        userId,
        isActive,
        joinedAt: new Date(),
      },
    });
  }

  // Get currently active patients in a consultation
  async findActivePatients(consultationId: number) {
    return this.participant.findMany({
      where: {
        consultationId,
        isActive: true,
        user: {
          role: 'Patient',
        },
      },
    });
  }

  // Find a consultation by ID
  async findConsultationById(consultationId: number) {
    return this.consultation.findUniqueOrThrow({
      where: { id: consultationId },
    });
  }

  // Update consultation status (e.g., to SCHEDULED when all leave)
  async updateConsultationStatus(consultationId: number, status: Prisma.ConsultationUpdateInput['status']) {
    return this.consultation.update({
      where: { id: consultationId },
      data: { status },
    });
  }

  // Save a message (text, file, image)
  async saveMessage(input: {
    consultationId: number;
    userId: number;
    content?: string;
    mediaUrl?: string;
    type: MessageType;
  }) {
    return this.message.create({
      data: {
        consultationId: input.consultationId,
        userId: input.userId,
        content: input.content,
        mediaUrl: input.mediaUrl,
        type: input.type,
      },
    });
  }

  // Mark a message as read by a user
  async markMessageAsRead(messageId: number, userId: number) {
    return this.messageRead.upsert({
      where: {
        messageId_userId: { messageId, userId },
      },
      update: {
        readAt: new Date(),
      },
      create: {
        messageId,
        userId,
        readAt: new Date(),
      },
    });
  }
}
