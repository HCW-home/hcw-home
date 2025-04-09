import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { DatabaseModule } from '../database/database.module';
import { BullModule } from '@nestjs/bull';
import { RemindersProcessor } from './reminders.processor';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'reminders',
    }),
  ],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersProcessor],
  exports: [RemindersService],
})
export class RemindersModule {}
