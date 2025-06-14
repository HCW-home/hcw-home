import { ApiProperty } from '@nestjs/swagger';
import { OrgMemberRole } from '@prisma/client';

export class UserBasicDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'User name', example: 'John Doe' })
  name: string;

  @ApiProperty({ description: 'User email', example: 'john@example.com' })
  email: string;

  @ApiProperty({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  avatar?: string;
}

export class OrganizationMemberResponseDto {
  @ApiProperty({ description: 'Member ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Organization ID', example: 1 })
  organizationId: number;

  @ApiProperty({ description: 'User ID', example: 1 })
  userId: number;

  @ApiProperty({
    description: 'Member role',
    enum: OrgMemberRole,
    example: OrgMemberRole.MEMBER,
  })
  role: OrgMemberRole;

  @ApiProperty({
    description: 'Date when user joined organization',
    example: '2024-01-15T10:30:00Z',
  })
  joinedAt: Date;

  @ApiProperty({
    description: 'User details',
    type: UserBasicDto,
  })
  user: UserBasicDto;
}
