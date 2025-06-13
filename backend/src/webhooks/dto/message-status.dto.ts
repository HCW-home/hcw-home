import { ApiProperty } from '@nestjs/swagger';

export class MessageStatusDto {
  @ApiProperty({ example: 'message-secret-id' })
  MessageSid: string;

  @ApiProperty({ example: 'delivered' })
  MessageStatus: string;

  @ApiProperty({ example: 'SMS', enum: ['SMS', 'EMAIL', 'WHATSAPP', 'MANUALLY'], required: false })
  Provider?: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'MANUALLY';
}
