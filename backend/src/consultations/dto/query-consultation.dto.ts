import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ConsultationStatus } from '@prisma/client';

export class QueryConsultationDto {
  @IsOptional()
  @IsInt()
  patientId?: number;

  @IsOptional()
  @IsInt()
  practitionerId?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @IsOptional()
  @IsString()
  patientName?: string;
}
