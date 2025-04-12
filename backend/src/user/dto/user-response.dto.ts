import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { Role, Sex, Status } from '@prisma/client';

class OrganizationDto {
  id: number;
  name: string;
}

class GroupDto {
  id: number;
  name: string;
}

class LanguageDto {
  id: number;
  name: string;
  code: string;
}

class SpecialtyDto {
  id: number;
  name: string;
}

export class UserResponseDto {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  
  @Exclude()
  password: string;
  
  role: Role;
  status: Status;
  temporaryAccount: boolean;
  phoneNumber?: string;
  country?: string;
  language?: string;
  sex?: Sex;
  createdAt: Date;
  updatedAt: Date;
  
  @Expose()
  @Type(() => OrganizationDto)
  organizations: OrganizationDto[];
  
  @Expose()
  @Type(() => GroupDto)
  groups: GroupDto[];
  
  @Expose()
  @Type(() => LanguageDto)
  languages: LanguageDto[];
  
  @Expose()
  @Type(() => SpecialtyDto)
  specialties: SpecialtyDto[];
  
  @Expose()
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
} 