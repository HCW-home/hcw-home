import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class ConnectionQualityDto {
  @ApiProperty({ example: 1, description: 'Connection quality ID' })
  id!: number;

  @ApiProperty({ example: 1, description: 'User ID' })
  userId!: number;

  @ApiProperty({ example: 1, description: 'Consultation ID' })
  consultationId!: number;

  @ApiProperty({ example: 2.5, description: 'Packet loss percentage' })
  packetLoss!: number;

  @ApiProperty({ example: 120, description: 'Latency in milliseconds' })
  latency!: number;

  @ApiProperty({ example: 0, description: 'Number of reconnection attempts' })
  reconnectAttempts!: number;

  @ApiProperty({ example: 85, description: 'Signal strength percentage' })
  signalStrength!: number;

  @ApiProperty({ type: Date, description: 'Created timestamp' })
  createdAt!: Date;

  @ApiProperty({ type: Date, description: 'Updated timestamp' })
  updatedAt!: Date;
}

export class MediaDeviceStatusDto {
  @ApiProperty({ example: 1, description: 'Media device status ID' })
  id!: number;

  @ApiProperty({ example: 1, description: 'User ID' })
  userId!: number;

  @ApiProperty({ example: 1, description: 'Consultation ID' })
  consultationId!: number;

  @ApiProperty({ example: true, description: 'Camera availability' })
  cameraAvailable!: boolean;

  @ApiProperty({ example: true, description: 'Camera enabled status' })
  cameraEnabled!: boolean;

  @ApiProperty({ example: false, description: 'Camera blocked status' })
  cameraBlocked!: boolean;

  @ApiProperty({ example: true, description: 'Microphone availability' })
  microphoneAvailable!: boolean;

  @ApiProperty({ example: true, description: 'Microphone enabled status' })
  microphoneEnabled!: boolean;

  @ApiProperty({ example: false, description: 'Microphone blocked status' })
  microphoneBlocked!: boolean;

  @ApiProperty({ type: Date, description: 'Last updated timestamp' })
  lastUpdated!: Date;
}

export class RealTimeEventDto {
  @ApiProperty({ example: 1, description: 'Event ID' })
  id!: number;

  @ApiProperty({ example: 1, description: 'Consultation ID' })
  consultationId!: number;

  @ApiProperty({ example: 1, description: 'User ID', nullable: true })
  userId?: number;

  @ApiProperty({ example: 'user_joined', description: 'Event type' })
  eventType!: string;

  @ApiProperty({ example: {}, description: 'Event data', nullable: true })
  eventData?: any;

  @ApiProperty({ example: 'User has joined the consultation', description: 'Event message', nullable: true })
  message?: string;

  @ApiProperty({ type: Date, description: 'Event timestamp' })
  createdAt!: Date;
}

export class WaitingRoomSessionDto {
  @ApiProperty({ example: 1, description: 'Waiting room session ID' })
  id!: number;

  @ApiProperty({ example: 1, description: 'Consultation ID' })
  consultationId!: number;

  @ApiProperty({ example: 1, description: 'User ID' })
  userId!: number;

  @ApiProperty({ type: Date, description: 'Time entered waiting room' })
  enteredAt!: Date;

  @ApiProperty({ type: Date, description: 'Time admitted to consultation', nullable: true })
  admittedAt?: Date;

  @ApiProperty({ type: Date, description: 'Time left waiting room', nullable: true })
  leftAt?: Date;

  @ApiProperty({ example: 5, description: 'Estimated wait time in minutes', nullable: true })
  estimatedWaitTime?: number;

  @ApiProperty({ example: 1, description: 'Position in queue', nullable: true })
  queuePosition?: number;

  @ApiProperty({ example: 'waiting', description: 'Session status' })
  status!: string;
}

export class TypingIndicatorDto {
  @ApiProperty({ example: 1, description: 'User ID' })
  userId!: number;

  @ApiProperty({ example: 1, description: 'Consultation ID' })
  consultationId!: number;

  @ApiProperty({ example: true, description: 'Is user currently typing' })
  isTyping!: boolean;

  @ApiProperty({ type: Date, description: 'Last updated timestamp' })
  lastUpdated!: Date;
}

export class EnhancedMessageDto {
  @ApiProperty({ example: 1, description: 'Message ID' })
  id!: number;

  @ApiProperty({ example: 1, description: 'User ID' })
  userId!: number;

  @ApiProperty({ example: 'Hello, how can I help you?', description: 'Message content' })
  content!: string;

  @ApiProperty({ type: Date, description: 'Created timestamp' })
  createdAt!: Date;

  @ApiProperty({ type: Date, description: 'Edited timestamp', nullable: true })
  editedAt?: Date;

  @ApiProperty({ example: false, description: 'Is system message' })
  isSystem!: boolean;

  @ApiProperty({ enum: UserRole, description: 'Sender role', nullable: true })
  senderRole?: UserRole;

  @ApiProperty({ example: 1, description: 'Consultation ID' })
  consultationId!: number;

  @ApiProperty({ example: 'TEXT', description: 'Message type' })
  messageType!: string;

  @ApiProperty({ example: 1, description: 'Reply to message ID', nullable: true })
  replyToId?: number;

  @ApiProperty({ example: false, description: 'Is message read' })
  isRead!: boolean;

  @ApiProperty({ type: Date, description: 'Read timestamp', nullable: true })
  readAt?: Date;

  @ApiProperty({ example: 'sent', description: 'Delivery status' })
  deliveryStatus!: string;

  @ApiProperty({ example: 'http://example.com/file.jpg', description: 'Media URL', nullable: true })
  mediaUrl?: string;

  @ApiProperty({ example: 'document.pdf', description: 'File name', nullable: true })
  fileName?: string;

  @ApiProperty({ example: 1024, description: 'File size in bytes', nullable: true })
  fileSize?: number;
}
