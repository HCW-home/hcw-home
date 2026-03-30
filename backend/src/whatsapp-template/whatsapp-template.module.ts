import { Module } from '@nestjs/common';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { WhatsappTemplateController } from './whatsapp-template.controller';
import { DatabaseModule } from 'src/database/database.module';
import { WhatsappTemplateSeederService } from './whatsapp-template-seeder.service';
import { ConfigModule } from 'src/config/config.module';
import { CoreModule } from '../core/core.module';
import { TwilioWhatsappService } from './twilio-template.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [DatabaseModule, ConfigModule, CoreModule, AuthModule],
  controllers: [WhatsappTemplateController],
  providers: [
    WhatsappTemplateService,
    WhatsappTemplateSeederService,
    TwilioWhatsappService,
  ],
  exports: [
    WhatsappTemplateService,
    WhatsappTemplateSeederService,
    TwilioWhatsappService,
  ],
})
export class WhatsappTemplateModule { }
