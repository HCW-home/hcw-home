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

    // Check if the message already exists
    let message = await this.db.message.findUnique({
      where: { providerMessageId: MessageSid },
    });


    if (!message) {
      console.log(`Message with SID ${MessageSid} not found. Creating a new message.`);


      const consultation = await this.db.consultation.create({
        data: {
          status: 'SCHEDULED',  // Default status
          scheduledDate: new Date(),  // Or set an appropriate value
        },
      });

      message = await this.db.message.create({
        data: {
          providerMessageId: MessageSid,
          status: MessageStatus, // Initialize with the current status
          sentAt: new Date(),
          provider: 'SMS',  // Adjust this as per your requirement
          consultation: {
            connect: { id: consultation.id },  // Link the newly created consultation
          },
        },
      });

    }

    // Create an audit log for status change
    await this.db.auditLog.create({
      data: {
        messageId: message.id,
        oldStatus: message.status,
        newStatus: MessageStatus,
      },
    });

    // Update the message status in the database
    await this.db.message.update({
      where: { id: message.id },
      data: { status: MessageStatus },
    });
  }
}
