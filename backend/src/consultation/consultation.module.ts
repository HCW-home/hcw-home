import { Module } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationController } from './consultation.controller';

@Module({
  providers: [ConsultationService],
  controllers: [ConsultationController]
})
export class ConsultationModule {}
