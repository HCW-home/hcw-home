import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notifications.service';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { DatabaseService } from '../../src/database/database.service';

@Module({
  imports: [ConfigModule], 
  providers: [
    NotificationService,
    EmailService,
    WhatsappService,
    DatabaseService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
