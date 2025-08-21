import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReadMessageDto } from './dto/read-message.dto';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  async createMessage(data: CreateMessageDto, file?: Express.Multer.File) {
    let mediaUrl: string | undefined;
    if (file) {
      mediaUrl = await this.storageService.uploadFile(file);
    }

    const message = await this.prisma.message.create({
      data: {
        ...data,
        mediaUrl,
        readReceipts: {
          create: {
            userId: data.userId,
            readAt: new Date(),
          },
        },
      },
    });
    return message;
  }

  async getMessages(consultationId: number) {
    return this.prisma.message.findMany({
      where: { consultationId },
      include: { readReceipts: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markMessageAsRead(data: ReadMessageDto) {
    return this.prisma.messageReadReceipt.create({
      data: {
        ...data,
        readAt: new Date(),
      },
    });
  }

  async createSystemMessage(consultationId: number, content: string) {
    const message = await this.prisma.message.create({
      data: {
        consultationId,
        content,
        isSystem: true,
        userId: 0, // A user ID of 0 can represent the system
        clientUuid: 'system-message',
      },
    });
    return message;
  }
}
