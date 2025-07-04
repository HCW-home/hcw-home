import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

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
