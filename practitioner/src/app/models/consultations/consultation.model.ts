import { ConsultationStatus } from '../../constants/consultation-status.enum';

export interface Consultation {
  id: string;
  patientName: string;
  joinTime: Date;
  status: ConsultationStatus;
}
