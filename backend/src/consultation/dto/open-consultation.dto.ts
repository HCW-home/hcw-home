import { ApiProperty } from '@nestjs/swagger';
import { ConsultationStatus, UserSex } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class OpenConsultationQueryDto {
  @ApiProperty({
    description: 'Page number for pagination',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    default: 10,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;
}

export class OpenConsultationPatientDto {
  @ApiProperty({ description: 'Patient ID' })
  id: number;

  @ApiProperty({ description: 'Patient first name', nullable: true })
  firstName: string | null;

  @ApiProperty({ description: 'Patient last name', nullable: true })
  lastName: string | null;

  @ApiProperty({
    description: 'Patient initials (fallback if names unavailable)',
  })
  initials: string;

  @ApiProperty({
    description: 'Patient sex',
    enum: UserSex,
    nullable: true,
  })
  sex: UserSex | null;

  @ApiProperty({
    description: 'Whether patient is currently offline',
    default: false,
  })
  isOffline: boolean;
}

export class OpenConsultationItemDto {
  @ApiProperty({ description: 'Consultation ID' })
  id: number;

  @ApiProperty({
    description: 'Patient information',
    type: OpenConsultationPatientDto,
  })
  patient: OpenConsultationPatientDto;

  @ApiProperty({
    description: 'Time since consultation started (formatted string)',
  })
  timeSinceStart: string;

  @ApiProperty({ description: 'Number of active participants' })
  participantCount: number;

  @ApiProperty({
    description: 'Last message or status preview',
    nullable: true,
  })
  lastMessage: string | null;

  @ApiProperty({
    description: 'Consultation status',
    enum: ConsultationStatus,
  })
  status?: ConsultationStatus;

  @ApiProperty({ description: 'When consultation started' })
  startedAt: Date;

  @ApiProperty({
    description: 'Group name if consultation belongs to a group',
    nullable: true,
  })
  groupName: string | null;
}

export class OpenConsultationResponseDto {
  @ApiProperty({
    description: 'List of open consultations',
    type: [OpenConsultationItemDto],
  })
  consultations: OpenConsultationItemDto[];

  @ApiProperty({ description: 'Total number of open consultations' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Whether there are more pages' })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether there is a previous page' })
  hasPreviousPage: boolean;
}

export class JoinOpenConsultationDto {
  @ApiProperty({ description: 'Consultation ID to join' })
  @Type(() => Number)
  @IsNumber()
  consultationId: number;
}

export class JoinOpenConsultationResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Consultation ID that was joined' })
  consultationId: number;

  @ApiProperty({
    description: 'Session URL for real-time consultation',
    nullable: true,
  })
  sessionUrl?: string;
}

export class CloseConsultationDto {
  @ApiProperty({ description: 'Consultation ID to close' })
  @Type(() => Number)
  @IsNumber()
  consultationId: number;

  @ApiProperty({
    description: 'Reason for closing the consultation',
    required: false,
  })
  @IsOptional()
  reason?: string;
}

export class CloseConsultationResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Consultation ID that was closed' })
  consultationId: number;

  @ApiProperty({ description: 'When the consultation was closed' })
  closedAt: Date;
}
