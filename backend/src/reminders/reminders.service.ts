import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { Reminder, ReminderStatus, ReminderType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private twilioClient: Twilio;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    // Initialize Twilio client if credentials are provided
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    
    if (accountSid && authToken) {
      this.twilioClient = new Twilio(accountSid, authToken);
    } else {
      this.logger.warn('Twilio credentials not provided. SMS/WhatsApp functionality will be mocked.');
    }
  }

  async create(createReminderDto: CreateReminderDto): Promise<Reminder> {
    return this.databaseService.reminder.create({
      data: {
        consultationId: createReminderDto.consultationId,
        recipientId: createReminderDto.recipientId,
        senderId: createReminderDto.senderId,
        type: createReminderDto.type,
        scheduledFor: new Date(createReminderDto.scheduledFor),
        message: createReminderDto.message,
      },
    });
  }

  async findAll(): Promise<Reminder[]> {
    return this.databaseService.reminder.findMany({
      include: {
        consultation: true,
        recipient: true,
        sender: true,
      },
    });
  }

  async findOne(id: number): Promise<Reminder> {
    const reminder = await this.databaseService.reminder.findUnique({
      where: { id },
      include: {
        consultation: true,
        recipient: true,
        sender: true,
      },
    });

    if (!reminder) {
      throw new NotFoundException(`Reminder with ID ${id} not found`);
    }

    return reminder;
  }

  async update(id: number, updateReminderDto: UpdateReminderDto): Promise<Reminder> {
    // Check if reminder exists
    await this.findOne(id);

    const data: any = {};

    if (updateReminderDto.type) {
      data.type = updateReminderDto.type;
    }

    if (updateReminderDto.status) {
      data.status = updateReminderDto.status;
    }

    if (updateReminderDto.scheduledFor) {
      data.scheduledFor = new Date(updateReminderDto.scheduledFor);
    }

    if (updateReminderDto.message !== undefined) {
      data.message = updateReminderDto.message;
    }

    if (updateReminderDto.maxRetries !== undefined) {
      data.maxRetries = updateReminderDto.maxRetries;
    }

    return this.databaseService.reminder.update({
      where: { id },
      data,
    });
  }

  async remove(id: number): Promise<Reminder> {
    // Check if reminder exists
    await this.findOne(id);

    return this.databaseService.reminder.delete({
      where: { id },
    });
  }

  async createConsultationReminders(
    consultationId: number,
    patientId: number,
    practitionerId: number,
    scheduledAt: Date,
  ): Promise<void> {
    const reminderTimes = [
      { hours: 24, label: '24 hours' },
      { hours: 1, label: '1 hour' },
    ];

    for (const reminderTime of reminderTimes) {
      const scheduledFor = new Date(scheduledAt);
      scheduledFor.setHours(scheduledFor.getHours() - reminderTime.hours);

      // Create patient reminder
      await this.create({
        consultationId,
        recipientId: patientId,
        senderId: practitionerId,
        type: ReminderType.SMS, // Default to SMS
        scheduledFor: scheduledFor.toISOString(),
        message: `Reminder: Your consultation is scheduled in ${reminderTime.label}.`,
      });

      // Create practitioner reminder
      await this.create({
        consultationId,
        recipientId: practitionerId,
        senderId: practitionerId, // Self-reminder
        type: ReminderType.SMS, // Default to SMS
        scheduledFor: scheduledFor.toISOString(),
        message: `Reminder: You have a consultation scheduled in ${reminderTime.label}.`,
      });
    }
  }

  async findPendingReminders(): Promise<Reminder[]> {
    const now = new Date();
    
    return this.databaseService.reminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        scheduledFor: {
          lte: now,
        },
      },
      include: {
        recipient: true,
        consultation: true,
      },
    });
  }

  async processReminder(reminder: Reminder): Promise<void> {
    try {
      // Send the reminder based on type
      switch (reminder.type) {
        case ReminderType.SMS:
          await this.sendSms(reminder);
          break;
        case ReminderType.WHATSAPP:
          await this.sendWhatsApp(reminder);
          break;
        case ReminderType.EMAIL:
          await this.sendEmail(reminder);
          break;
        default:
          throw new Error(`Unsupported reminder type: ${reminder.type}`);
      }

      // Update reminder status to SENT
      await this.databaseService.reminder.update({
        where: { id: reminder.id },
        data: {
          status: ReminderStatus.SENT,
          sentAt: new Date(),
        },
      });

      this.logger.log(`Reminder ${reminder.id} sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send reminder ${reminder.id}: ${error.message}`);
      
      // Increment retry count
      const updatedReminder = await this.databaseService.reminder.update({
        where: { id: reminder.id },
        data: {
          status: ReminderStatus.FAILED,
          retryCount: { increment: 1 },
        },
      });

      // Check if we should retry
      if (updatedReminder.retryCount < updatedReminder.maxRetries) {
        await this.databaseService.reminder.update({
          where: { id: reminder.id },
          data: {
            status: ReminderStatus.RETRY,
            // Schedule retry in 15 minutes
            scheduledFor: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
        this.logger.log(`Scheduled retry for reminder ${reminder.id}`);
      }
    }
  }

  private async sendSms(reminder: Reminder): Promise<void> {
    if (!reminder.recipient.phone) {
      throw new Error('Recipient phone number not available');
    }

    if (this.twilioClient) {
      // Use Twilio to send actual SMS
      await this.twilioClient.messages.create({
        body: reminder.message,
        from: this.configService.get<string>('TWILIO_PHONE_NUMBER'),
        to: reminder.recipient.phone,
      });
    } else {
      // Mock SMS sending in development
      this.logger.log(`[MOCK SMS] To: ${reminder.recipient.phone}, Message: ${reminder.message}`);
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async sendWhatsApp(reminder: Reminder): Promise<void> {
    if (!reminder.recipient.phone) {
      throw new Error('Recipient phone number not available');
    }

    if (this.twilioClient) {
      // Use Twilio to send WhatsApp message
      await this.twilioClient.messages.create({
        body: reminder.message,
        from: `whatsapp:${this.configService.get<string>('TWILIO_WHATSAPP_NUMBER')}`,
        to: `whatsapp:${reminder.recipient.phone}`,
      });
    } else {
      // Mock WhatsApp sending in development
      this.logger.log(`[MOCK WhatsApp] To: ${reminder.recipient.phone}, Message: ${reminder.message}`);
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async sendEmail(reminder: Reminder): Promise<void> {
    // Email implementation would go here
    // For now, just log it
    this.logger.log(`[MOCK Email] To: ${reminder.recipient.email}, Message: ${reminder.message}`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
