import { Module } from '@nestjs/common';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { WhatsappTemplateController } from './whatsapp-template.controller';
import { DatabaseModule } from 'src/database/database.module';
import { WhatsappTemplateSeederService } from './whatsapp-template-seeder.service';
import { ConfigModule } from 'src/config/config.module';
import { AuthModule } from 'src/auth/auth.module';
import { TwilioWhatsappService } from './twilio-template.service';

@Module({
  imports: [DatabaseModule , ConfigModule , AuthModule],
  controllers: [WhatsappTemplateController],
  providers: [
    WhatsappTemplateService,
    WhatsappTemplateSeederService,
    TwilioWhatsappService
  ],
  exports: [WhatsappTemplateService, WhatsappTemplateSeederService , TwilioWhatsappService],
})
export class WhatsappTemplateModule {}
