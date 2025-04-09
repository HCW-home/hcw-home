export enum ConsultationStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  phone?: string;
}

export interface Consultation {
  id: number;
  patientId: number;
  practitionerId: number;
  scheduledAt: string;
  endedAt?: string;
  status: ConsultationStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  patient?: User;
  practitioner?: User;
}
