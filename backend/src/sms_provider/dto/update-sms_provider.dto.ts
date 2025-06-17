import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';

export class UpdateSmsProviderDto {
  @ApiProperty({
    description: 'Order of the SMS provider',
    example: 1,
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Order must be an integer' })
  @Min(0, { message: 'Order must be a non-negative integer' })
  order?: number;

  @ApiProperty({
    description: 'Name of the SMS provider',
    example: 'Twilio',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Provider must be a string' })
  @Max(100, { message: 'Provider name cannot exceed 100 characters' })
  provider?: string;

  @ApiProperty({
    description: 'Prefix for the SMS provider',
    example: 'TW',
    required: false,
    maxLength: 20,
  })
  @IsOptional()
  @IsString({ message: 'Prefix must be a string' })
  @Max(20, { message: 'Prefix cannot exceed 20 characters' })
  prefix?: string;

  @ApiProperty({
    description: 'Whether the provider supports WhatsApp',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isWhatsapp must be a boolean' })
  isWhatsapp?: boolean;

  @ApiProperty({
    description: 'Whether the provider is disabled',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isDisabled must be a boolean' })
  isDisabled?: boolean;
}