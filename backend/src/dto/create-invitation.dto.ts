import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum MessageServiceDto {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  MANUALLY = 'MANUALLY',
}

export enum InvitationRoleDto {
  Expert = 'Expert',
  Guest = 'Guest',
}

export class CreateInvitationDto {
  @IsString()
  name: string;

  @IsString()
  contactValue: string;

  @IsEnum(MessageServiceDto)
  contactMethod: MessageServiceDto;

  @IsEnum(InvitationRoleDto)
  role: InvitationRoleDto;

  @IsOptional()
  @IsString()
  notes?: string;
} 