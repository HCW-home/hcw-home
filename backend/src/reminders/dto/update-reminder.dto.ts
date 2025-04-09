import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ReminderStatus, ReminderType } from '@prisma/client';

export class UpdateReminderDto {
  @IsOptional()
  @IsEnum(ReminderType)
  type?: ReminderType;

  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsInt()
  maxRetries?: number;
}
