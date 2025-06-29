import { Module } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationController } from './consultation.controller';
import { ConsultationGateway } from './consultation.gateway';
import { DatabaseService } from 'src/database/database.service';
import { ConfigModule } from 'src/config/config.module';
import { ConsultationCleanupService } from './consultation-cleanup.service';

@Module({
  imports: [ConfigModule],
  controllers: [ConsultationController],
  providers: [
    ConsultationService,
    ConsultationGateway,
    ConsultationCleanupService,
    DatabaseService,
    {
      provide: 'CONSULTATION_GATEWAY',
      useExisting: ConsultationGateway,
    },
  ],
  exports: [ConsultationService],
})
export class ConsultationModule {}
