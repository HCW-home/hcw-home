import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class UpdateMediasoupServerDto {
  @ApiPropertyOptional({
    description: 'Mediasoup server URL',
    example: 'https://media.example.com',
    type: String,
  })
  @IsOptional()
  @IsUrl({}, { message: 'Invalid URL format' })
  @IsString()
  url?: string;

  @ApiPropertyOptional({
    description: 'Username for server authentication',
    example: 'mediauser',
    type: String,
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of concurrent sessions',
    example: 100,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxNumberOfSessions?: number;

  @ApiPropertyOptional({
    description: 'Whether the server is active',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Password for server authentication',
    example: 'supersecret',
    type: String,
  })
  @IsOptional()
  @IsString()
  password?: string;
}
