import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

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
