import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { MediaEventType } from '@prisma/client';

@Injectable()
export class MediaEventService {
  constructor(private readonly prisma: DatabaseService) {}

  async createMediaEvent(
    consultationId: number,
    userId: number,
    type: MediaEventType,
  ) {
    return this.prisma.mediaEvent.create({
      data: {
        consultationId,
        userId,
        type,
      },
    });
  }
}
