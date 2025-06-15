import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class QuerySmsProviderDto {
  @ApiProperty({
    description: 'Page number',
    example: 1,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be greater than 0' })
  page?: number;

  @ApiProperty({
    description: 'Items per page',
    example: 10,
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be greater than 0' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number;

  @ApiProperty({
    description: 'Search term for provider name or prefix',
    example: 'Twilio',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  search?: string;

  @ApiProperty({
    description: 'Filter by WhatsApp support',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isWhatsapp must be a boolean' })
  isWhatsapp?: boolean;

  @ApiProperty({
    description: 'Filter by disabled status',
    example: false,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isDisabled must be a boolean' })
  isDisabled?: boolean;

  @ApiProperty({
    description: 'Field to sort by',
    enum: ['id', 'order', 'provider', 'prefix', 'createdAt', 'updatedAt'],
    example: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsEnum(['id', 'order', 'provider', 'prefix', 'createdAt', 'updatedAt'], {
    message:
      'sortBy must be one of: id, order, provider, prefix, createdAt, updatedAt',
  })
  sortBy?: string;

  @ApiProperty({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    example: 'desc',
    required: false,
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'], {
    message: 'sortOrder must be either asc or desc',
  })
  sortOrder?: string;
}
