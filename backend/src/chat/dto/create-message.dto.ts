import { IsInt, IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateMessageDto {
  @IsInt()
  userId: number;

  @IsInt()
  consultationId: number;

  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsString()
  @IsOptional()
  mediaType?: string;

  @IsUUID()
  clientUuid: string;

  @IsOptional()
  file?: Express.Multer.File;
}
