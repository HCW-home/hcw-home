import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WebhooksService {
  constructor(private readonly db: DatabaseService) {}

  async processStatusUpdate(payload: {
    MessageSid: string;
    MessageStatus: string;
    [key: string]: any;
  }) {
    const { MessageSid, MessageStatus } = payload;


    let message = await this.db.message.findUnique({
      where: { providerMessageId: MessageSid },
    });


    if (!message) {
      console.log(`Message with SID ${MessageSid} not found. Creating a new message.`);


      const consultation = await this.db.consultation.create({
        data: {
          status: 'SCHEDULED', 
          scheduledDate: new Date(), 
        },
      });

      message = await this.db.message.create({
        data: {
          providerMessageId: MessageSid,
          status: MessageStatus, 
          sentAt: new Date(),
          provider: 'SMS', 
          consultation: {
            connect: { id: consultation.id },  
          },
        },
      });

    }


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
