import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsInt, IsObject, IsOptional, IsPhoneNumber, IsString, IsArray } from 'class-validator';
import { ConsultationStatus, MessageService } from '@prisma/client';

class ConsultationDto {
  @ApiProperty()
  @IsInt()
  id: number;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  @IsOptional()
  @IsDate()
  scheduledDate?: Date;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  @IsOptional()
  @IsDate()
  createdAt?: Date;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  @IsOptional()
  @IsDate()
  startedAt?: Date;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  @IsOptional()
  @IsDate()
  closedAt?: Date;

  @ApiPropertyOptional({ example: 'fever, cough' })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  specialityId?: number;

  @ApiPropertyOptional({ type: [Object], description: 'List of participants' })
  @IsOptional()
  @IsArray()
  participants?: any[]; 

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  createdBy?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  ownerId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  groupId?: number;

  @ApiProperty({ required: false, enum: MessageService })
  @IsOptional()
  @IsEnum(MessageService)
  messageService?: MessageService;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  whatsappTemplateId?: number;

  @ApiProperty({ enum: ConsultationStatus })
  @IsEnum(ConsultationStatus)
  status: ConsultationStatus;
}

export class PatientDto {
  @ApiProperty()
  @IsInt()
  id: number;

  @ApiProperty()
  @IsString()
  role: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsPhoneNumber(undefined)
  phoneNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sex?: string;

  @ApiProperty()
  @IsString()
  status: string;
}

export class ConsultationHistoryItemDto {
  @ApiProperty({ type: ConsultationDto })
  @IsObject()
  consultation: ConsultationDto;

  @ApiProperty({ type: PatientDto })
  @IsObject()
  patient: PatientDto;

  @ApiProperty()
  @IsString()
  duration: string;
}
