import { ApiProperty } from '@nestjs/swagger';

export class GroupMemberResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  groupId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  joinedAt: Date;

  @ApiProperty({ required: false })
  user?: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}
