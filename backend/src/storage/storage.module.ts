import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { CloudinaryModule } from 'nestjs-cloudinary';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    CloudinaryModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        cloud_name: configService.get('cloudinary.cloud_name'),
        api_key: configService.get('cloudinary.api_key'),
        api_secret: configService.get('cloudinary.api_secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [StorageService],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}
