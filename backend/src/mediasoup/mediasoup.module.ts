import { forwardRef, Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '../config/config.module';
import { MediasoupServerService } from './mediasoup.service';
import { MediasoupSessionService } from './mediasoup-session.service';
import { MediasoupServerController } from './mediasoup.controller';
import { MediasoupGateway } from './mediasoup.gateway';
import { DatabaseModule } from '../database/database.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { ConsultationModule } from '../consultation/consultation.module';
import { MediaEventService } from './media-event.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    UserModule,
    AuthModule,
    forwardRef(() => ConsultationModule),
    ChatModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
  ],
  controllers: [MediasoupServerController],
  providers: [
    MediasoupServerService,
    MediasoupSessionService,
    MediasoupGateway,
    MediaEventService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [MediasoupServerService, MediasoupSessionService, MediaEventService],
})
export class MediasoupModule {}
