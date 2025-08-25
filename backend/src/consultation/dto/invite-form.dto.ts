import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDate,
  IsNumber,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConsultationStatus } from '@prisma/client';

export class CreatePatientConsultationDto {
  @ApiProperty({ description: 'Patient first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Patient last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'Patient gender', enum: ['Male', 'Female', 'Other'] })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiProperty({ description: 'Patient preferred language' })
  @IsString()
  @IsNotEmpty()
  language: string;

  @ApiPropertyOptional({ description: 'Group ID (optional)' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiProperty({ 
    description: 'Patient contact (email or phone number with +41 or +33)',
    example: '+41123456789 or patient@example.com'
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/(^\+\d{2}\d{6,}$)|(^\S+@\S+\.\S+$)/, {
    message: 'Contact must be a valid email or phone number starting with +41 or +33'
  })
  contact: string;

  @ApiPropertyOptional({ description: 'Scheduled date for the consultation' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledDate?: Date;

  @ApiPropertyOptional({ description: 'Speciality ID' })
  @IsOptional()
  @IsNumber()
  specialityId?: number;

  @ApiPropertyOptional({ description: 'Patient symptoms or notes' })
  @IsOptional()
  @IsString()
  symptoms?: string;
}

export class PatientResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  phoneNumber?: string;

  @ApiProperty()
  isNewPatient: boolean;
}

export class ConsultationSimpleResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: ConsultationStatus })
  status: ConsultationStatus;

  @ApiProperty()
  ownerId: number;

  @ApiPropertyOptional()
  scheduledDate?: Date;
}

export class CreatePatientConsultationResponseDto {
  @ApiProperty({ type: PatientResponseDto })
  patient: PatientResponseDto;

  @ApiProperty({ type: ConsultationSimpleResponseDto })
  consultation: ConsultationSimpleResponseDto;
}