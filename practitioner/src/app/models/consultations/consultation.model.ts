import { ConsultationStatus } from '../../constants/consultation-status.enum';

export interface User {
  id: number;
  role: 'PATIENT' | 'PRACTITIONER' | 'ADMIN';
  firstName: string;
  lastName: string;
  email?: string;
  temporaryAccount?: boolean;
  phoneNumber?: string | null;
  country?: string | null;
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  status: 'APPROVED' | 'NOT_APPROVED';
  createdAt: Date;
  updatedAt: Date;
}

export interface Consultation {
  id: number;
  scheduledDate?: Date | null;
  createdAt?: Date | null;
  startedAt?: Date | null;
  closedAt?: Date | null;
  createdBy?: number | null;
  groupId?: number | null;
  ownerId?: number | null;
  whatsappTemplateId?: number | null;
  status: ConsultationStatus;
}

export interface Participant {
  id: number;
  consultationId: number;
  userId: number;
  isActive: boolean;
  isBeneficiary: boolean;
  token?: string | null;
  joinedAt?: Date | null;
}

export interface Message {
  id: number;
  userId: number;
  content: string;
  consultationId?: number | null;
  createdAt: Date;
}

export interface ConsultationHistoryItem {
  consultation: Consultation;
  patient: User;
  participants: Participant[];
  duration: string;
}

export interface ConsultationDetail extends ConsultationHistoryItem {
  messages: Message[];
}
