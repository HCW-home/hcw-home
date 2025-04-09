import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Job } from 'bull';
import { RemindersService } from './reminders.service';

@Injectable()
@Processor('reminders')
export class RemindersProcessor {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(private readonly remindersService: RemindersService) {}

  @Process('send-reminder')
  async handleSendReminder(job: Job) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    const reminderId = job.data.reminderId;
    
    try {
      const reminder = await this.remindersService.findOne(reminderId);
      await this.remindersService.processReminder(reminder);
      this.logger.debug(`Job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(`Error processing job ${job.id}: ${error.message}`);
      throw error;
    }
  }

  @Cron('0 * * * * *') // Run every minute
  async checkPendingReminders() {
    this.logger.debug('Checking for pending reminders');
    
    try {
      const pendingReminders = await this.remindersService.findPendingReminders();
      
      this.logger.debug(`Found ${pendingReminders.length} pending reminders`);
      
      for (const reminder of pendingReminders) {
        await this.remindersService.processReminder(reminder);
      }
    } catch (error) {
      this.logger.error(`Error checking pending reminders: ${error.message}`);
    }
  }
}
