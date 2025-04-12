import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Role, Sex, Status } from '@prisma/client';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @Length(6, 100)
  password?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsEnum(Status)
  @IsOptional()
  status?: Status;

  @IsBoolean()
  @IsOptional()
  temporaryAccount?: boolean;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsEnum(Sex)
  @IsOptional()
  sex?: Sex;

  @IsArray()
  @IsOptional()
  organizationIds?: number[];

  @IsArray()
  @IsOptional()
  groupIds?: number[];

  @IsArray()
  @IsOptional()
  languageIds?: number[];

  @IsArray()
  @IsOptional()
  specialtyIds?: number[];
} 