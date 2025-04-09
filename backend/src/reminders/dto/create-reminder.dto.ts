import { IsDateString, IsEnum, IsInt, IsString } from 'class-validator';
import { ReminderType } from '@prisma/client';

export class CreateReminderDto {
  @IsInt()
  consultationId: number;

  @IsInt()
  recipientId: number;

  @IsInt()
  senderId: number;

  @IsEnum(ReminderType)
  type: ReminderType;

  @IsDateString()
  scheduledFor: string;

  @IsString()
  message: string;
}
