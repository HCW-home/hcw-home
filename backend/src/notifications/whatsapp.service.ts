import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { DatabaseService } from '../../src/database/database.service';
import { Whatsapp_Template } from '@prisma/client';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly twilioClient: Twilio;
  private readonly fromNumber: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_FROM')!;

    if (!accountSid || !authToken || !this.fromNumber) {
      throw new Error('❌ Twilio configuration is missing in .env');
    }

    this.twilioClient = new Twilio(accountSid, authToken);
  }

  async sendWhatsapp(to: string, templateId: number, variables: Record<string, string> = {}): Promise<void> {
    const template = await this.db.whatsapp_Template.findUnique({
      where: { id: String(templateId) },
    });

    if (!template) {
      this.logger.warn(`WhatsApp template with ID ${templateId} not found.`);
      return;
    }

    const messageBody = this.interpolateVariables(template.body, variables);

    await this.sendMessage(to, messageBody);
  }

  async sendTemplateMessage(input: {
    to: string;
    template: Whatsapp_Template;
    variables: Record<string, string>;
  }): Promise<void> {
    const messageBody = this.interpolateVariables(input.template.body, input.variables);
    await this.sendMessage(input.to, messageBody);
  }

  private async sendMessage(to: string, body: string): Promise<void> {
    try {
      const message = await this.twilioClient.messages.create({
        body,
        from: this.fromNumber,
        to: `whatsapp:${to}`,
      });

      this.logger.log(`✅ WhatsApp message sent to ${to} | SID: ${message.sid}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send WhatsApp message to ${to}`, error);
    }
  }

  private interpolateVariables(body: string, variables: Record<string, string>): string {
    return body.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
      return variables[key] ?? '';
    });
  }
}
