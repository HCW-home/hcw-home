import { ConsultationStatus } from '../../constants/consultation-status.enum';

export interface ConsultationParticipant {
  user: {
    firstName: string;
    lastName: string;
    country: string;
  };
  joinedAt: string;
}

export interface Consultation {
  id: string;
  scheduledDate: string;
  status: ConsultationStatus;
  participants: ConsultationParticipant[];
  patientName?: string;
  joinTime?: Date;
}
