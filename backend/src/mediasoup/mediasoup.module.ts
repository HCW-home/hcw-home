import { Module } from '@nestjs/common';
import { MediasoupServerService } from './mediasoup.service';
import { MediasoupServerController } from './mediasoup.controller';
import { DatabaseModule } from 'src/database/database.module';
import { UserModule } from 'src/user/user.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [MediasoupServerController],
  providers: [MediasoupServerService],
  imports: [DatabaseModule, UserModule, AuthModule],
})
export class MediasoupModule {}
