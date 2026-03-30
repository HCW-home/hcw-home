import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReminderService } from './reminder.service';
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '../../config/config.module';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    ConfigModule,
    CoreModule
  ],
  providers: [ReminderService],
  exports: [ReminderService]
})
export class ReminderModule { }
