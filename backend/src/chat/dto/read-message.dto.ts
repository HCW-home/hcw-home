import { IsInt } from 'class-validator';

export class ReadMessageDto {
  @IsInt()
  messageId: number;

  @IsInt()
  userId: number;

  @IsInt()
  consultationId: number;
}
