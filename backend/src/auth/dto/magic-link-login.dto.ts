import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class MagicLinkLoginDto {
  @ApiProperty({ description: 'Magic link token' })
  @IsString()
  token: string;
}
export class MagicLinkResponseDto {
  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'User role' })
  role: string;

  constructor(partial: Partial<MagicLinkResponseDto>) {
    Object.assign(this, partial);
  }
}
