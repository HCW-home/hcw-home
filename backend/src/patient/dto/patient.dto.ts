import { IsDate, IsInt, IsNotEmpty, IsOptional, IsPhoneNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePatientDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;

  @IsOptional()
  @IsPhoneNumber(null, { message: 'Phone number must be valid' })
  phoneNumber?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdatePatientDto {
  @IsOptional()
  @IsPhoneNumber(null, { message: 'Phone number must be valid' })
  phoneNumber?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  address?: string;
}

export class PatientResponseDto {
  id: number;
  userId: number;
  phoneNumber?: string;
  dateOfBirth?: Date;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: number;
    email: string;
    name?: string;
    role: string;
  };
}
