import { IsInt, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ConsultationStatus } from '@prisma/client';

export class HistoryQueryDto {
  @Type(() => Number)
  @IsInt()
  practitionerId: number;

  @IsOptional()
  @IsEnum(ConsultationStatus, { each: false })
  status?: ConsultationStatus;
}
