import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
  @ApiProperty({ description: 'Email address', format: 'email' })
  email: string;

  @ApiProperty({ description: 'Password', minLength: 8, maxLength: 100 })
  password: string;

  constructor(partial: Partial<LoginUserDto>) {
    Object.assign(this, partial);
  }
}

export class LoginResponseDto {
  @ApiProperty({ description: 'Access token for authenticated user' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh  token for authenticated user ' })
  refreshToken?: string;

  @ApiProperty({ description: 'User ID' })
  userId: number;

  @ApiProperty({ description: 'User email' })
  email: string;

  constructor(partial: Partial<LoginResponseDto>) {
    Object.assign(this, partial);
  }
}
