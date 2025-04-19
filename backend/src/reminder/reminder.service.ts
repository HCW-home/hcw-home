import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(private schedulerRegistry: SchedulerRegistry) {}

  scheduleReminderJob(consultationId: number, scheduledDate: Date, intervalInMs: number, deliveryChannel: string) {
    const reminderTime = new Date(scheduledDate.getTime() - intervalInMs);
    const now = new Date();

    const delay = reminderTime.getTime() - now.getTime();
    if (delay <= 0) {
      this.logger.warn(`Reminder time already passed for consultation ${consultationId}`);
      return;
    }

    const jobName = `reminder-${consultationId}-${intervalInMs/1000}`;

    const timeout = setTimeout(() => {
      this.logger.log(`you have consultation in ${intervalInMs / 1000} seconds. Be ready!`);

      this.schedulerRegistry.deleteTimeout(jobName); 
    }, delay);

    this.schedulerRegistry.addTimeout(jobName, timeout);
    this.logger.log(`remainder have been set for ${jobName} . you will get notification in ${delay / 1000} seconds via ${deliveryChannel}`);
  }

  deleteReminderJobs(consultationId: number) {
    const jobs = this.schedulerRegistry.getTimeouts().filter(name => name.startsWith(`reminder-${consultationId}-`));
    for (const jobName of jobs) {
      this.schedulerRegistry.deleteTimeout(jobName);
      this.logger.log(`Deleted old reminder job: ${jobName}`);
    }
  }
}
