import { Module } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationController } from './consultation.controller';
import { ConsultationGateway } from './consultation.gateway';
import { ReminderModule } from 'src/reminder/reminder.module'; 
@Module({
  imports: [ReminderModule], 
  providers: [ConsultationService, ConsultationGateway],
  controllers: [ConsultationController]
})
export class ConsultationModule {}
