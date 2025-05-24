import { Module } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationController } from './consultation.controller';
import { ConsultationGateway } from './consultation.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule], 
  providers: [ConsultationService, ConsultationGateway],
  controllers: [ConsultationController],
})
export class ConsultationModule {}
