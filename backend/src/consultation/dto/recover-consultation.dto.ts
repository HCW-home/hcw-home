import { IsEmail, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class RecoverConsultationDto {
  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @ValidateIf((o) => !o.phoneNumber || o.email)
  email?: string;

  @IsOptional()
  @IsString({ message: 'Phone number must be a valid string' })
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Please enter a valid phone number (E.164 format recommended: +123456789)',
  })
  @ValidateIf((o) => !o.email || o.phoneNumber)
  phoneNumber?: string;

  constructor(partial: Partial<RecoverConsultationDto>) {
    Object.assign(this, partial);
  }
} 