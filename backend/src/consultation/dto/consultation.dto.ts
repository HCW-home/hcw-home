import { IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ConsultationStatus } from '@prisma/client';

export class CreateConsultationDto {
  @IsInt()
  @IsNotEmpty()
  patientId: number;

  @IsOptional()
  @IsInt()
  practitionerId?: number;

  @IsDate()
  @IsNotEmpty()
  @Type(() => Date)
  scheduledStart: Date;

  @IsDate()
  @IsNotEmpty()
  @Type(() => Date)
  scheduledEnd: Date;

  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateConsultationDto {
  @IsOptional()
  @IsInt()
  practitionerId?: number;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledStart?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledEnd?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  actualStart?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  actualEnd?: Date;

  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  joinLink?: string;
}

export class UpdateConsultationStatusDto {
  @IsEnum(ConsultationStatus)
  @IsNotEmpty()
  status: ConsultationStatus;
}

export class BookingRequestDto {
  @IsInt()
  @IsNotEmpty()
  patientId: number;

  @IsNotEmpty()
  @IsDate({ each: true })
  @Type(() => Date)
  preferredDate: Date[];

  @IsOptional()
  @IsString()
  notes?: string;
}
