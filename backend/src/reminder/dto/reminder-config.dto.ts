import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ReminderType } from '../reminder.constants';

export class ReminderConfigDto {
  @ApiProperty({ description: 'Whether reminders are enabled for this consultation' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean = true;

  @ApiPropertyOptional({ description: 'Types of reminders to send', enum: ReminderType, isArray: true })
  @IsEnum(ReminderType, { each: true })
  @IsOptional()
  types?: ReminderType[];
}
