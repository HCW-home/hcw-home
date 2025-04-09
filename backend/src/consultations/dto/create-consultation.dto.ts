import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateConsultationDto {
  @IsInt()
  patientId: number;

  @IsInt()
  practitionerId: number;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
