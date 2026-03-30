import { Module } from '@nestjs/common';
import { SmsProviderService } from './sms_provider.service';
import { SmsProviderController } from './sms_provider.controller';
import { DatabaseModule } from 'src/database/database.module';
import { CoreModule } from '../core/core.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [SmsProviderController],
  providers: [SmsProviderService],
  imports: [DatabaseModule, CoreModule, AuthModule],
  exports: [SmsProviderService],
})
export class SmsProviderModule { }
