import { IsBoolean, IsOptional, IsString, Matches,IsPhoneNumber } from 'class-validator';

export class UpdateNotificationSettingDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Invalid phone number' }) 
  phone?: string;
}
