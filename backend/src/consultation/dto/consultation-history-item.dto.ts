import { ConsultationStatus, MessageService } from '@prisma/client';

export class ConsultationHistoryItemDto {
  consultation: {
    id: number;
    scheduledDate?: Date;
    createdAt?: Date;
    startedAt?: Date;
    closedAt?: Date;
    createdBy?: number;
    ownerId?: number;
    groupId?: number;
    messageService?: MessageService;
    whatsappTemplateId?: number;
    status: ConsultationStatus;
  };
  patient: {
    id: number;
    role: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    country?: string;
    sex?: string;
    status: string;
  };
  duration: string;
}
