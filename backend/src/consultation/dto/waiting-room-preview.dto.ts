import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for a single waiting room preview entry.
 */
export class WaitingRoomPreviewDto {
  @ApiProperty({
    example: 1,
    description: 'Unique identifier for the waiting room entry',
  })
  id!: number;

  @ApiProperty({ example: 'AB', description: 'Initials of the patient' })
  patientInitials!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2024-06-01T12:00:00Z',
    description: 'Time when the patient joined, or null',
  })
  joinTime!: Date | null;

  @ApiProperty({
    example: 'English',
    nullable: true,
    description: 'Preferred language of the patient, or null',
  })
  language!: string | null;

  @ApiProperty({
    example: 1,
    description: 'Position in the waiting queue',
  })
  queuePosition!: number;

  @ApiProperty({
    example: '15 mins',
    description: 'Estimated wait time (formatted string)',
  })
  estimatedWaitTime!: string;

  @ApiProperty({
    example: 'Cardiology',
    nullable: true,
    description: 'Group name for this consultation',
  })
  group!: string | null;

  @ApiProperty({
    example: 'General Medicine',
    nullable: true,
    description: 'Speciality name for this consultation',
  })
  speciality!: string | null;
}

/**
 * Standardized DTO for the waiting room response (list + count).
 */
export class WaitingRoomPreviewResponseDto {
  @ApiProperty({
    example: true,
    description: 'Indicates if the request was successful',
  })
  success: boolean;

  @ApiProperty({ example: 200, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Waiting rooms fetched successfully',
    description: 'Response message',
  })
  message: string;

  @ApiProperty({
    type: [WaitingRoomPreviewDto],
    description: 'List of waiting room previews',
  })
  waitingRooms: WaitingRoomPreviewDto[];

  @ApiProperty({ example: 10, description: 'Total count of waiting rooms' })
  totalCount: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ example: 5, description: 'Total number of pages' })
  totalPages: number;

  constructor(partial: Partial<WaitingRoomPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}
