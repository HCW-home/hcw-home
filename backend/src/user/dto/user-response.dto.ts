import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { UserRole, UserSex, UserStatus } from '@prisma/client';
import {Transform } from 'class-transformer';

export class IdNameDto {
  @ApiProperty()
  @Expose()
  id: number;

  @ApiProperty()
  @Expose()
  name: string;
}

export class UserResponseDto {
  @ApiProperty({ description: 'User ID' })
  @Expose()
  id: number;

  @ApiProperty({ enum: UserRole, description: 'User role' })
  @Expose()
  role: UserRole;

  @ApiProperty({ description: 'First name' })
  @Expose()
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  @Expose()
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  @Expose()
  email: string;


  @ApiProperty({ description: 'term version' })
  @Expose()
  termVersion:number
  @ApiProperty({ description: 'term acccepted  date' })
  @Expose()
  acceptedAt: Date;



  @Exclude()
  password: string;

  @ApiProperty({ description: 'Temporary account flag' })
  @Expose()
  temporaryAccount: boolean;

  @ApiProperty({ description: 'Phone number', nullable: true })
  @Expose()
  phoneNumber: string | null;

  @ApiProperty({ description: 'Country', nullable: true })
  @Expose()
  country: string | null;

  @ApiProperty({ enum: UserSex, description: 'Gender', nullable: true })
  @Expose()
  sex: UserSex | null;

  @ApiProperty({ enum: UserStatus, description: 'User status' })
  @Expose()
  status: UserStatus;

  @ApiProperty({ description: 'Creation date' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({ type: [IdNameDto] })
  @Expose()
  @Transform(({ obj }) =>
    obj.OrganizationMember?.map((m: any) => ({
      id: m.organization?.id,
      name: m.organization?.name,
    })) || []
  )
  organizations: IdNameDto[];

  @ApiProperty({ type: [IdNameDto], required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.GroupMember?.map((m: any) => ({
      id: m.group?.id,
      name: m.group?.name,
    })) || []
  )
  groups?: IdNameDto[];

  @ApiProperty({ type: [IdNameDto], required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.languages?.map((l: any) => ({
      id: l.language?.id,
      name: l.language?.name,
    })) || []
  )
  languages?: IdNameDto[];

  @ApiProperty({ type: [IdNameDto], required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.specialities?.map((s: any) => ({
      id: s.speciality?.id,
      name: s.speciality?.name,
    })) || []
  )
  specialities?: IdNameDto[];


  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}

