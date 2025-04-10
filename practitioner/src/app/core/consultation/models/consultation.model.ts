import { MessageService } from './message-type.model';

export interface Consultation {
  id?: string;
  patientId: string;
  practitionerId: string;
  createdAt?: Date;
  status: ConsultationStatus;
  language: string;
  messageService: MessageService;
  introMessage?: string;
  magicLink?: string;
  templateId?: string; 
}

export enum ConsultationStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface Participant {
  id?: string;
  consultationId: string;
  role: ParticipantRole;
  userId: string;
  name: string;
  email?: string;
  phone?: string;
}

export enum ParticipantRole {
  PATIENT = 'PATIENT',
  PRACTITIONER = 'PRACTITIONER'
}

export interface InviteFormData {
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  language: string;
  messageService: MessageService; 
  introMessage?: string;
  templateId?: string; 
}