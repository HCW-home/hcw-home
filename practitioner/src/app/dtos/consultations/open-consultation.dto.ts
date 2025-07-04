import { Cons } from "rxjs";
import { ConsultationStatus } from "../../constants/consultation-status.enum";
import { UserSex } from "../../constants/user-sex.enum";

export interface OpenConsultationPatient {
  id: number;
  firstName: string | null;
  lastName: string | null;
  initials: string;
  sex: UserSex | null;
  isOffline: boolean;
}

export interface OpenConsultation {
  id: number;
  patient: OpenConsultationPatient;
  timeSinceStart: string;
  participantCount: number;
  lastMessage: string | null;
  status: ConsultationStatus;
  startedAt: Date;
  groupName: string | null;
}

export interface OpenConsultationResponse {
  consultations: OpenConsultation[];
  total: number;
  currentPage: number;
  totalPages: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  status: string;
  statusCode: number;
  message: string;
  timestamp: string;
  data: T;
}

export interface JoinConsultationResponse {
  success: boolean;
  statusCode: number;
  message: string;
  consultationId: number;
  sessionUrl?: string;
}

export interface CloseConsultationResponse {
  success: boolean;
  statusCode: number;
  message: string;
  consultationId: number;
  closedAt: Date;
}
