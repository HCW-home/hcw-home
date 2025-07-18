import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus, UserRole } from '@prisma/client';

/**
 * DTO for joining a consultation as a patient or practitioner.
 */
export class JoinConsultationDto {
  @ApiProperty({
    description: 'ID of the user joining the consultation',
    example: 123,
    type: Number,
    minimum: 1,
  })
  @IsInt({ message: 'userId must be an integer' })
  @IsPositive({ message: 'userId must be a positive integer' })
  userId: number;
}

/**
 * Participant information within join response.
 */
export class JoinConsultationParticipantDto {
  @ApiProperty({ example: 123, description: 'User ID of participant' })
  id: number;

  @ApiProperty({ example: 'Amir', description: 'First name' })
  firstName: string;

  @ApiProperty({ example: 'Shaikh', description: 'Last name' })
  lastName: string;

  @ApiProperty({ example: 'PATIENT', enum: UserRole, description: 'User role' })
  role: UserRole;

  @ApiProperty({ example: true, description: 'Is participant active' })
  isActive: boolean;
}

export class JoinConsultationMessageDto {
  @ApiProperty({ example: 1, description: 'Message ID' })
  id: number;

  @ApiProperty({ example: 123, description: 'User ID of sender' })
  userId: number;

  @ApiProperty({ example: 'Hello there!', description: 'Message content' })
  content: string;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'Message creation timestamp',
  })
  createdAt: Date;
}

/**
 * Standardized response DTO for joining a consultation.
 */
export class JoinConsultationResponseDto {
  @ApiProperty({
    description: 'Indicates if the join was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({ description: 'HTTP status code', example: 200 })
  statusCode: number;

  @ApiProperty({
    description: 'Response message',
    example: 'Joined consultation successfully',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'ID of the consultation joined',
    example: 456,
    type: Number,
  })
  consultationId?: number;

  @ApiPropertyOptional({
    description: 'URL for the session, if applicable',
    example: '/session/consultation/456',
    type: String,
  })
  sessionUrl?: string;

  @ApiPropertyOptional({
    type: [JoinConsultationParticipantDto],
    description: 'List of participants in the consultation',
  })
  participants?: JoinConsultationParticipantDto[];

  @ApiProperty({
    type: [JoinConsultationMessageDto],
    required: false,
    description: 'List of messages in the consultation on join',
  })
  messages?: JoinConsultationMessageDto[];

  @ApiPropertyOptional({
    description: 'Mediasoup session details for this consultation',
    type: 'object',
    properties: {
      routerId: { type: 'number', example: 123 },
      active: { type: 'boolean', example: true },
    },
    additionalProperties: false,
    example: { routerId: 123, active: true },
  })
  mediasoup?: {
    routerId: number;
    active: boolean;
  };

  @ApiPropertyOptional({
    description: 'Status of the consultation after join',
    example: 'ACTIVE',
    enum: ConsultationStatus,
  })
  status?: ConsultationStatus;

  constructor(partial: Partial<JoinConsultationResponseDto>) {
    Object.assign(this, partial);
  }
}
