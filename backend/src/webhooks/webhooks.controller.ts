import { Controller, Post, Body } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { MessageStatusDto } from './dto/message-status.dto';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('message-status')
  async handleStatusUpdate(@Body() body: MessageStatusDto) {
    try {
      await this.webhooks.processStatusUpdate(body);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err.message || 'Error processing webhook',
      };
    }
  }
}