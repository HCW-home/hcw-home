import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
} from 'class-validator';

export class ExportConsultationsDto {
  @ApiPropertyOptional({
    description: 'Filter consultations from this date (ISO 8601 format).',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter consultations up to this date (ISO 8601 format).',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Filter consultations by a specific practitioner ID.',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  practitionerId?: number;

  @ApiPropertyOptional({
    description: 'Filter consultations by status.',
    enum: ConsultationStatus,
    example: ConsultationStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;
} 