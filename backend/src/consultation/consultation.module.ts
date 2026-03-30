import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { ChatModule } from 'src/chat/chat.module';
import { AuthModule } from 'src/auth/auth.module';
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
import { InviteModule } from '../auth/invite/invite.module';
import { EnhancedRealtimeService } from './enhanced-realtime.service';
import { WaitingRoomService } from './waiting-room.service';
import { ReminderModule } from 'src/reminder/reminder.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    UserModule,
    CoreModule,
    AvailabilityModule,
    InviteModule,
    ChatModule,
    AuthModule,
    ReminderModule,
  ],
  controllers: [ConsultationController],
  providers: [
    ConsultationGateway,
    ConsultationService,
    ConsultationMediaSoupService,
    ConsultationCleanupService,
    ConsultationUtilityService,
    EnhancedRealtimeService,
    WaitingRoomService,
    {
      provide: CONSULTATION_GATEWAY_TOKEN,
      useFactory: (gateway: ConsultationGateway) => {
        return gateway;
      },
      inject: [ConsultationGateway],
    },
  ],
  exports: [
    ConsultationService,
    ConsultationMediaSoupService,
    ConsultationGateway,
    ConsultationCleanupService,
    ConsultationUtilityService,
    EnhancedRealtimeService,
    WaitingRoomService,
    CONSULTATION_GATEWAY_TOKEN,
  ],
})
export class ConsultationModule implements OnModuleInit {
  onModuleInit() {
    const logger = new Logger(ConsultationModule.name);
    logger.log('=== ConsultationModule initialized ===');
  }
}

