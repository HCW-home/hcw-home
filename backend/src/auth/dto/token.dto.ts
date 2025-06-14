import { ApiProperty } from '@nestjs/swagger';

export class TokenDto {
  @ApiProperty({ example: 'your-refresh-token-string' })
  refreshToken?: string;

  @ApiProperty({ example: 'your-access-token-string' })
  accessToken?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'your-refresh-token-string' })
  refreshToken: string;
}
