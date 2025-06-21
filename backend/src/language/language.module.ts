import { Module } from '@nestjs/common';
import { LanguageService } from './language.service';
import { LanguageController } from './language.controller';

@Module({
  controllers: [LanguageController],
  providers: [LanguageService],
})
export class LanguageModule {}
