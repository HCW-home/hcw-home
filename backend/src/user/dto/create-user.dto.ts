import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserSex, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ enum: UserRole, description: 'User role' })
  role: UserRole;

  @ApiProperty({ description: 'First name', minLength: 2, maxLength: 50 })
  firstName: string;

  @ApiProperty({ description: 'Last name', minLength: 2, maxLength: 50 })
  lastName: string;

  @ApiProperty({ description: 'Email address', format: 'email' })
  email: string;

  @ApiProperty({ description: 'Password', minLength: 8, maxLength: 100 })
  password: string;

  @ApiProperty({
    description: 'Temporary account flag',
    required: false,
    default: false,
  })
  temporaryAccount?: boolean;

  @ApiProperty({ description: 'Phone number', required: false })
  phoneNumber?: string;

  @ApiProperty({ description: 'Country', required: false })
  country?: string;

  @ApiProperty({ enum: UserSex, description: 'Gender', required: false })
  sex?: UserSex;

  @ApiProperty({
    enum: UserStatus,
    description: 'User status',
    required: false,
    default: UserStatus.NOT_APPROVED,
  })
  status?: UserStatus;

  @ApiProperty({ type: [Number], description: 'Organisation IDs the user belongs to' })
  organisationIds: number[];

  @ApiProperty({ type: [Number], description: 'Optional Group IDs', required: false })
  groupIds?: number[];

  @ApiProperty({ type: [Number], description: 'Language IDs', required: false })
  languageIds?: number[];

  @ApiProperty({ type: [Number], description: 'Speciality IDs', required: false })
  specialityIds?: number[];
}
