import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChangeMediasoupServerPasswordDto {
  @ApiProperty({
    description: 'Current password',
    example: 'OldPassword123!',
    type: String,
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'New password',
    example: 'NewPassword123!',
    type: String,
  })
  @IsString()
  newPassword: string;
}
