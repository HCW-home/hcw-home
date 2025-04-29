export enum ConsultationStatus {
  SCHEDULED = 'SCHEDULED',
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface Practitioner {
  firstName: string;
  lastName: string;
}

export interface Participant {
  user: Practitioner;
}

export interface Consultation {
  id: number;
  status: ConsultationStatus;
  scheduledDate?: Date;
  startedAt?: Date;
  participants?: Participant[];
  practitioner?: Participant[];
}

export interface ConsultationsResponse {
  success: boolean;
  consultations: Consultation[];
} 