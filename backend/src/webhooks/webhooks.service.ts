import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MessageService } from '@prisma/client';

@Injectable()
export class WebhooksService {
  constructor(private readonly db: DatabaseService) {}
  async processStatusUpdate(payload: {
    MessageSid: string;
    MessageStatus: string;
    Provider?: keyof typeof MessageService;
    [key: string]: any;
  }) {
    const { MessageSid, MessageStatus, Provider } = payload;
    const user = await this.db.user.findFirst();
    if (!user) {
      throw new Error('No users found. Please create a user first.');
    }

    const provider = Provider && MessageService[Provider] ? Provider : null;

    let message = await this.db.message.findUnique({
      where: { uuid: MessageSid },
    });

    if (!message) {
      const consultation = await this.db.consultation.create({
        data: {
          status: 'SCHEDULED',
          scheduledDate: new Date(),
        },
      });

      message = await this.db.message.create({
        data: {
          uuid: MessageSid,
          status: MessageStatus,
          sentAt: new Date(),
          provider: provider as MessageService,
          content: 'Webhook status update message',
          user: { connect: { id: user.id } },
          consultation: { connect: { id: consultation.id } },
        },
      });
    } else if (message.status !== MessageStatus) {
      await this.db.auditLog.create({
        data: {
          messageId: message.id,
          oldStatus: message.status,
          newStatus: MessageStatus,
        },
      });

      await this.db.message.update({
        where: { id: message.id },
        data: { status: MessageStatus },
      });
    }
  }
}
