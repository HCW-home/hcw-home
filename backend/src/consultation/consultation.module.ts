import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { DatabaseModule } from 'src/database/database.module';
import { ConfigModule } from 'src/config/config.module';
import { ConsultationCleanupService } from './consultation-cleanup.service';
import { UserModule } from 'src/user/user.module';
import { CoreModule } from 'src/core/core.module';
import { ConsultationService } from './consultation.service';
import { ConsultationMediaSoupService } from './consultation-mediasoup.service';
import { ConsultationGateway } from './consultation.gateway';
import { AvailabilityModule } from 'src/availability/availability.module';
import { CONSULTATION_GATEWAY_TOKEN } from './interfaces/consultation-gateway.interface';
import { ConsultationUtilityService } from './consultation-utility.service';
import { ConsultationInvitationModule } from './consultation-invitation.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    UserModule,
    CoreModule,
    AvailabilityModule,
    ConsultationInvitationModule,
  ],
  controllers: [ConsultationController],
  providers: [
    ConsultationService,
    ConsultationMediaSoupService,
    ConsultationGateway,
    ConsultationCleanupService,
    ConsultationUtilityService,
    {
      provide: CONSULTATION_GATEWAY_TOKEN,
      useExisting: forwardRef(() => ConsultationGateway),
    },
  ],
  exports: [
    ConsultationService,
    ConsultationMediaSoupService,
    ConsultationGateway,
    ConsultationCleanupService,
    ConsultationUtilityService,
    CONSULTATION_GATEWAY_TOKEN,
  ],
})
export class ConsultationModule implements OnModuleInit {
  onModuleInit() {}
}
export class ConsultationModule {} 
