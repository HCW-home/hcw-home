import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class RatingDto {
  @ApiProperty({ example: 4 })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ enum: ['green', 'red', null], nullable: true })
  @IsOptional()
  @IsEnum(['green', 'red', null])
  color: 'green' | 'red' | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  done: boolean;
}

export class ConsultationPatientHistoryItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  consultationId: number;

  @ApiProperty({ example: 'Dr. John Doe' })
  @IsString()
  practitionerName: string;

  @ApiProperty({ example: ['Cardiology', 'General Medicine'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  practitionerSpeciality: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledDate: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startedAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  closedAt: Date | null;

  @ApiProperty({ enum: ConsultationStatus })
  @IsEnum(ConsultationStatus)
  status: ConsultationStatus;

  @ApiPropertyOptional({ example: 'Fever, cough', nullable: true })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiPropertyOptional({ example: 3, nullable: true })
  @IsOptional()
  @IsInt()
  remainingDays?: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  canJoin: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  waitingForDoctor: boolean;

  @ApiPropertyOptional({ type: RatingDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => RatingDto)
  rating?: RatingDto;
}

export class ConsultationPatientHistoryResponseDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  success: boolean;

  @ApiProperty({ example: 200 })
  @IsInt()
  statusCode: number;

  @ApiProperty({ example: 'Consultation history fetched successfully.' })
  @IsString()
  message: string;

  @ApiProperty({ type: [ConsultationPatientHistoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsultationPatientHistoryItemDto)
  consultations: ConsultationPatientHistoryItemDto[];
}
