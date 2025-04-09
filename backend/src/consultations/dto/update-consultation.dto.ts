import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ConsultationStatus } from '@prisma/client';

export class UpdateConsultationDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
