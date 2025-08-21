import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';
import { ConsultationModule } from 'src/consultation/consultation.module';
import { MediasoupModule } from 'src/mediasoup/mediasoup.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    ConsultationModule,
    MediasoupModule,
    StorageModule,
  ],
  providers: [ChatGateway, ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
