import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class AddParticipantDto {
  @ApiProperty({ description: 'Consultation ID' })
  @IsNumber()
  consultationId: number;

  @ApiProperty({ description: "Participant's email" })
  @IsEmail()
  email: string;

  @ApiProperty({
    enum: [UserRole.EXPERT, UserRole.GUEST],
    description: "Participant's role",
  })
  @IsEnum([UserRole.EXPERT, UserRole.GUEST])
  role: UserRole;

  @ApiProperty({ description: "Participant's name" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Optional notes for the participant' })
  @IsOptional()
  @IsString()
  notes?: string;
}
