import { ApiProperty } from '@nestjs/swagger';

export class AddMemberToGroupDto {
  @ApiProperty({
    description: 'ID of the user to add to the group',
    example: 123,
    type: 'integer',
    minimum: 1,
  })
  userId: number;
}
