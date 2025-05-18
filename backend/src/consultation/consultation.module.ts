import { Module } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [ConsultationController],
  providers: [ConsultationService, DatabaseService],
})
export class ConsultationModule {}
