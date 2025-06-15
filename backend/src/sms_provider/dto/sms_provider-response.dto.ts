import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class SmsProviderResponseDto {
  @ApiProperty({
    description: 'SMS Provider ID',
    example: 1,
  })
  @Expose()
  id: number;

  @ApiProperty({
    description: 'Order of the SMS provider',
    example: 1,
    nullable: true,
  })
  @Expose()
  order: number | null;

  @ApiProperty({
    description: 'Name of the SMS provider',
    example: 'Twilio',
    nullable: true,
  })
  @Expose()
  provider: string | null;

  @ApiProperty({
    description: 'Prefix for the SMS provider',
    example: 'TW',
    nullable: true,
  })
  @Expose()
  prefix: string | null;

  @ApiProperty({
    description: 'Whether the provider supports WhatsApp',
    example: false,
  })
  @Expose()
  isWhatsapp: boolean;

  @ApiProperty({
    description: 'Whether the provider is disabled',
    example: false,
  })
  @Expose()
  isDisabled: boolean;

  @ApiProperty({
    description: 'Creation date',
    example: '2024-01-15T10:30:00.000Z',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Last update date',
    example: '2024-01-15T10:30:00.000Z',
  })
  @Expose()
  updatedAt: Date;
}