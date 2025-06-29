import { IsIn, IsNotEmpty, IsNumber } from 'class-validator';

export const END_CONSULTATION_ACTIONS = [
  'keep_open',
  'close',
  'terminate_open',
] as const;
export type EndConsultationAction = (typeof END_CONSULTATION_ACTIONS)[number];

export class EndConsultationDto {
  @IsNumber()
  @IsNotEmpty()
  consultationId: number;

  @IsIn(END_CONSULTATION_ACTIONS)
  action: EndConsultationAction;
}

export class EndConsultationResponseDto {
  success: boolean;
  message: string;
  consultationId: number;
  status: string;
  deletionScheduledAt?: Date | null;
  retentionHours?: number;
}
