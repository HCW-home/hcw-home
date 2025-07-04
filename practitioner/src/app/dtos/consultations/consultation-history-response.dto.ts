import { ConsultationStatus } from '../../constants/consultation-status.enum';
import { UserResponseDto } from '../users/user-response.dto';
import { ParticipantResponseDto } from './participant-response.dto';

export interface ConsultationHistoryResponseDto {
  ownerId: number | null | undefined;
  id: number;
  scheduledDate?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  closedAt?: string | null;
  createdBy?: number | null;
  groupId?: number | null;
  whatsappTemplateId?: number | null;
  status: ConsultationStatus;
  patient: UserResponseDto;
  participants?: ParticipantResponseDto[];
}
