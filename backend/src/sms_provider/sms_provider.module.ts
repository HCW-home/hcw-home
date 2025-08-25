import { Module } from '@nestjs/common';
import { SmsProviderService } from './sms_provider.service';
import { SmsProviderController } from './sms_provider.controller';
import { DatabaseModule } from 'src/database/database.module';
import { UserModule } from 'src/user/user.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [SmsProviderController],
  providers: [SmsProviderService],
  imports: [DatabaseModule, UserModule, AuthModule],
  exports: [SmsProviderService],
})
export class SmsProviderModule {}
