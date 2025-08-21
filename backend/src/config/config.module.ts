import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';

@Module({
  imports: [
    NestConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
  controllers: [ConfigController],
})
export class ConfigModule {}
