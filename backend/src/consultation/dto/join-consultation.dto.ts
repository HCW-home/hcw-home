import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  constructor(partial: Partial<JoinConsultationResponseDto>) {
    Object.assign(this, partial);
  }
}
