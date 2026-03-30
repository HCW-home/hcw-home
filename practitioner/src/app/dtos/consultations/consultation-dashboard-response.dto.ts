import { Consultation } from "../../models/consultations/consultation.model";
import { OpenConsultationPatient } from "./open-consultation.dto";

export interface WaitingRoomItem {
  selected: boolean;
  id: number;
  patientInitials: string;
  joinTime: Date | null;
  language: string | null;
  queuePosition: number;
  estimatedWaitTime: string;
  reason?: string;
}

export interface WaitingRoomResponse {
  success: boolean;
  statusCode: number;
  message: string;
  waitingRooms: WaitingRoomItem[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  timestamp: string;
  data?: any; // Added missing data property
}
export interface OpenConsultationItem {
  id: number;
  patient: OpenConsultationPatient;
  timeSinceStart: string;
  participantCount: number;
  lastMessage: string | null;
  status: string;
  startedAt: string;
  groupName: string | null;
}

export interface ConsultationWithPatient {
  patient: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    initials: string;
    sex: string | null;
    isOffline: boolean;
  };
  consultation: Consultation;
}
