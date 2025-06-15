import { Module } from '@nestjs/common';
import { SmsProviderService } from './sms_provider.service';
import { SmsProviderController } from './sms_provider.controller';
import { DatabaseModule } from 'src/database/database.module';
import { UserModule } from 'src/user/user.module';

@Module({
  controllers: [SmsProviderController],
  providers: [SmsProviderService],
  imports:[DatabaseModule,UserModule]
})
export class SmsProviderModule {}
