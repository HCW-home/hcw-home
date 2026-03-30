import { Module, Global } from '@nestjs/common';
import { ConfigModule } from 'src/config/config.module';
import { MediasoupServerService } from './mediasoup.service';
import { MediasoupServerController } from './mediasoup.controller';
import { MediasoupGateway } from './mediasoup.gateway';
import { DatabaseModule } from 'src/database/database.module';
import { UserModule } from 'src/user/user.module';
import { AuthModule } from 'src/auth/auth.module';
import { MediaEventService } from './media-event.service';
import { MediasoupSessionService } from './mediasoup-session.service';
import { ChatModule } from 'src/chat/chat.module';
import { InviteModule } from 'src/auth/invite/invite.module';

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, UserModule, AuthModule, ChatModule, InviteModule],
  controllers: [MediasoupServerController],
  providers: [
    MediasoupServerService,
    MediasoupSessionService,
    MediasoupGateway,
    MediaEventService,
  ],
  exports: [MediasoupServerService, MediasoupSessionService, MediaEventService],
})
export class MediasoupModule { }
