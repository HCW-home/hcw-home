import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, Max, IsEmail, IsEnum, Length } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateMediaDeviceStatusDto {
  @ApiProperty({ example: true, description: 'Camera availability', required: false })
  @IsOptional()
  @IsBoolean()
  cameraAvailable?: boolean;

  @ApiProperty({ example: true, description: 'Camera enabled status', required: false })
  @IsOptional()
  @IsBoolean()
  cameraEnabled?: boolean;

  @ApiProperty({ example: false, description: 'Camera blocked status', required: false })
  @IsOptional()
  @IsBoolean()
  cameraBlocked?: boolean;

  @ApiProperty({ example: true, description: 'Microphone availability', required: false })
  @IsOptional()
  @IsBoolean()
  microphoneAvailable?: boolean;

  @ApiProperty({ example: true, description: 'Microphone enabled status', required: false })
  @IsOptional()
  @IsBoolean()
  microphoneEnabled?: boolean;

  @ApiProperty({ example: false, description: 'Microphone blocked status', required: false })
  @IsOptional()
  @IsBoolean()
  microphoneBlocked?: boolean;
}

export class UpdateConnectionQualityDto {
  @ApiProperty({ example: 2.5, description: 'Packet loss percentage', required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  packetLoss?: number;

  @ApiProperty({ example: 120, description: 'Latency in milliseconds', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  latency?: number;

  @ApiProperty({ example: 0, description: 'Number of reconnection attempts', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reconnectAttempts?: number;

  @ApiProperty({ example: 85, description: 'Signal strength percentage', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  signalStrength?: number;
}

export class AdmitPatientDto {
  @ApiProperty({ example: 1, description: 'Patient user ID to admit' })
  @IsNumber()
  patientId!: number;

  @ApiProperty({ example: 'Welcome to the consultation', description: 'Optional welcome message', required: false })
  @IsOptional()
  @IsString()
  welcomeMessage?: string;
}

export class CreateRealTimeEventDto {
  @ApiProperty({ example: 'user_joined', description: 'Event type' })
  @IsString()
  eventType!: string;

  @ApiProperty({ example: {}, description: 'Event data', required: false })
  @IsOptional()
  eventData?: any;

  @ApiProperty({ example: 'User has joined the consultation', description: 'Event message', required: false })
  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateTypingIndicatorDto {
  @ApiProperty({ example: true, description: 'Is user currently typing' })
  @IsBoolean()
  isTyping!: boolean;
}

export class SendEnhancedMessageDto {
  @ApiProperty({ example: 'Hello, how can I help you?', description: 'Message content' })
  @IsString()
  content!: string;

  @ApiProperty({ example: 1, description: 'Reply to message ID', required: false })
  @IsOptional()
  @IsNumber()
  replyToId?: number;

  @ApiProperty({ example: 'TEXT', description: 'Message type', required: false })
  @IsOptional()
  @IsString()
  messageType?: string;

  @ApiProperty({ example: 'http://example.com/file.jpg', description: 'Media URL', required: false })
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiProperty({ example: 'document.pdf', description: 'File name', required: false })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiProperty({ example: 1024, description: 'File size in bytes', required: false })
  @IsOptional()
  @IsNumber()
  fileSize?: number;
}

export class RealtimeWaitingRoomStatsDto {
  @ApiProperty({ example: 5, description: 'Total patients waiting' })
  totalWaiting!: number;

  @ApiProperty({ example: 3, description: 'Average wait time in minutes' })
  averageWaitTime!: number;

  @ApiProperty({ example: 1, description: 'Longest wait time in minutes' })
  longestWaitTime!: number;
}

export class AddParticipantDto {
  @ApiProperty({ enum: UserRole, example: 'EXPERT', description: 'Participant role' })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ example: 'expert@example.com', description: 'Participant email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @Length(1, 50)
  firstName!: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @Length(1, 50)
  lastName!: string;

  @ApiProperty({ example: 'Cardiology specialist', description: 'Notes about the participant', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class RemoveParticipantDto {
  @ApiProperty({ example: 123, description: 'Participant user ID to remove' })
  @IsNumber()
  participantId!: number;

  @ApiProperty({ example: 'No longer needed for this consultation', description: 'Reason for removal', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  reason?: string;
}

export class HandleMediaPermissionErrorDto {
  @ApiProperty({
    example: 'camera_denied',
    description: 'Type of media permission error',
    enum: ['camera_denied', 'microphone_denied', 'device_unavailable', 'device_in_use']
  })
  @IsString()
  @IsEnum(['camera_denied', 'microphone_denied', 'device_unavailable', 'device_in_use'])
  errorType!: string;

  @ApiProperty({ example: 'User denied camera access', description: 'Detailed error message' })
  @IsString()
  errorDetails!: string;
}

export class CreateSystemNotificationDto {
  @ApiProperty({
    example: 'connection_quality_warning',
    description: 'Type of system notification',
    enum: ['waiting_time_update', 'connection_quality_warning', 'participant_limit_reached']
  })
  @IsString()
  @IsEnum(['waiting_time_update', 'connection_quality_warning', 'participant_limit_reached'])
  messageType!: string;

  @ApiProperty({ example: { estimatedTime: 10 }, description: 'Additional message data' })
  @IsOptional()
  messageData?: any;
}
