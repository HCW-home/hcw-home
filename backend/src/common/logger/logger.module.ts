import { Module } from '@nestjs/common';
import { AppLoggerService } from './app-logger.service';

@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggerModule {} 