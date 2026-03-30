import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class WaitingRoomConsultationDto {
  @ApiProperty({ example: 1, description: 'Consultation ID' })
  id: number;

  @ApiProperty({ example: '2024-01-15T10:00:00Z', description: 'Scheduled date and time' })
  scheduledDate?: Date;

  @ApiProperty({ example: 'WAITING', description: 'Consultation status' })
  status: string;

  @ApiProperty({ example: 'Chest pain, difficulty breathing', description: 'Patient symptoms' })
  symptoms?: string;

  @ApiProperty({ description: 'Patient information' })
  patient: {
    id: number;
    initials: string;
    joinedAt?: Date;
    language?: string;
    waitTime?: number; // in minutes
  };

  @ApiProperty({ example: '2024-01-15T10:05:00Z', description: 'When patient joined waiting room' })
  patientJoinedAt?: Date;

  @ApiProperty({ example: true, description: 'Whether patient is currently in waiting room' })
  patientInWaitingRoom: boolean;

  @ApiProperty({ example: 15, description: 'Current wait time in minutes' })
  currentWaitTime?: number;

  @ApiProperty({ example: 1, description: 'Queue position' })
  queuePosition?: number;

  @ApiProperty({ example: 'en', description: 'Patient preferred language' })
  preferredLanguage?: string;
}

export class WaitingRoomStatsDto {
  @ApiProperty({ example: 5, description: 'Total patients waiting' })
  totalWaiting: number;

  @ApiProperty({ example: 12, description: 'Average wait time in minutes' })
  averageWaitTime: number;

  @ApiProperty({ example: 25, description: 'Longest wait time in minutes' })
  longestWaitTime: number;
}

export class PractitionerWaitingRoomDto {
  @ApiProperty({ description: 'List of consultations in waiting room' })
  consultations: WaitingRoomConsultationDto[];

  @ApiProperty({ description: 'Waiting room statistics' })
  stats: WaitingRoomStatsDto;

  @ApiProperty({ example: 10, description: 'Total count for pagination' })
  totalCount: number;

  @ApiProperty({ example: 1, description: 'Current page' })
  page: number;

  @ApiProperty({ example: 10, description: 'Items per page' })
  limit: number;
}

export class WaitingRoomSessionDto {
  @ApiProperty({ example: 1, description: 'Session ID' })
  id: number;

  @ApiProperty({ example: 123, description: 'Consultation ID' })
  consultationId: number;

  @ApiProperty({ example: 456, description: 'User ID' })
  userId: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Time entered waiting room' })
  enteredAt: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false, description: 'Time admitted to consultation' })
  admittedAt?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false, description: 'Time left waiting room' })
  leftAt?: Date;

  @ApiProperty({ example: 15, required: false, description: 'Estimated wait time in minutes' })
  estimatedWaitTime?: number;

  @ApiProperty({ example: 2, required: false, description: 'Queue position' })
  queuePosition?: number;

  @ApiProperty({ example: 'waiting', description: 'Session status' })
  status: string;
}


export class JoinWaitingRoomDto {
  @ApiProperty({ example: 1, description: 'Consultation ID' })
  @IsInt()
  consultationId: number;

  @ApiProperty({ example: 1, description: 'Patient user ID' })
  @IsInt()
  userId: number;

  @ApiProperty({ example: 'en', description: 'Preferred language', required: false })
  @IsString()
  @IsOptional()
  preferredLanguage?: string;
}

export class AdmitFromWaitingRoomDto {
  @ApiProperty({ example: 1, description: 'Consultation ID' })
  @IsInt()
  consultationId: number;

  @ApiProperty({ example: 1, description: 'Patient user ID' })
  @IsInt()
  patientId: number;

  @ApiProperty({ example: 'Welcome to your consultation!', description: 'Welcome message', required: false })
  @IsString()
  @IsOptional()
  welcomeMessage?: string;
}

export class LiveConsultationJoinDto {
  @ApiProperty({ example: 1, description: 'Consultation ID' })
  @IsInt()
  consultationId: number;

  @ApiProperty({ example: 1, description: 'User ID' })
  @IsInt()
  userId: number;

  @ApiProperty({ enum: UserRole, example: 'PRACTITIONER', description: 'User role' })
  @IsEnum(UserRole)
  role: UserRole;
}

export class ConsultationParticipantDto {
  @ApiProperty({ example: 1, description: 'User ID' })
  id: number;

  @ApiProperty({ example: 'John', description: 'First name' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  lastName: string;

  @ApiProperty({ enum: UserRole, example: 'PATIENT', description: 'User role' })
  role: UserRole;

  @ApiProperty({ example: true, description: 'Is currently active in consultation' })
  isActive: boolean;

  @ApiProperty({ example: '2024-01-15T10:05:00Z', description: 'When user joined consultation' })
  joinedAt?: Date;

  @ApiProperty({ example: '2024-01-15T10:25:00Z', description: 'Last seen timestamp' })
  lastSeenAt?: Date;

  @ApiProperty({ example: 'en', description: 'Preferred language' })
  language?: string;

  @ApiProperty({ example: 85, description: 'Connection quality score (0-100)' })
  connectionQuality?: number;
}

export class LiveConsultationDataDto {
  @ApiProperty({ example: 1, description: 'Consultation ID' })
  id: number;

  @ApiProperty({ example: 'ACTIVE', description: 'Consultation status' })
  status: string;

  @ApiProperty({ example: '2024-01-15T10:00:00Z', description: 'When consultation started' })
  startedAt?: Date;

  @ApiProperty({ description: 'List of active participants' })
  participants: ConsultationParticipantDto[];

  @ApiProperty({ description: 'Recent message history' })
  recentMessages: any[];

  @ApiProperty({ example: 'Chest pain consultation', description: 'Consultation topic/symptoms' })
  symptoms?: string;

  @ApiProperty({ example: true, description: 'Whether waiting room is enabled' })
  waitingRoomEnabled: boolean;

  @ApiProperty({ example: false, description: 'Whether to auto-admit patients' })
  autoAdmitPatients: boolean;
}
