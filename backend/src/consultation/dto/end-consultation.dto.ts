import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const END_CONSULTATION_ACTIONS = [
  'keep_open',
  'close',
  'terminate_open',
] as const;
export type EndConsultationAction = (typeof END_CONSULTATION_ACTIONS)[number];

export class EndConsultationDto {
  @ApiProperty({ example: 123, description: 'ID of the consultation' })
  @IsNumber()
  @IsNotEmpty()
  consultationId: number;

  @ApiProperty({
    enum: END_CONSULTATION_ACTIONS,
    description: 'Action to perform on the consultation',
    example: 'close',
  })
  @IsIn(END_CONSULTATION_ACTIONS)
  action: EndConsultationAction;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class EndConsultationResponseDto {
  @ApiProperty({ example: true, description: 'Indicates if the operation was successful' })
  success: boolean;

  @ApiProperty({ example: 'Consultation closed successfully', description: 'Response message' })
  message: string;

  @ApiProperty({ example: 123, description: 'ID of the consultation' })
  consultationId: number;

  @ApiProperty({ example: 'closed', description: 'Current status of the consultation' })
  status: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2024-06-01T12:00:00Z', description: 'Scheduled deletion time, if applicable' })
  deletionScheduledAt?: Date | null;

  @ApiPropertyOptional({ example: 24, description: 'Retention period in hours, if applicable' })
  retentionHours?: number;
}
