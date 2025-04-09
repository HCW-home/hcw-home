import { Module } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { ConsultationsController } from './consultations.controller';
import { DatabaseModule } from '../database/database.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [DatabaseModule, RemindersModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
