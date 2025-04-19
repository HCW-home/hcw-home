import { Module } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ReminderService],
  exports: [ReminderService],
})
export class ReminderModule {}
