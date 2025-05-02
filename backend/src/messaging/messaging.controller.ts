import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessageSupportResponse } from './messaging.types';

@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  /**
   * Check if a phone number can receive messages via SMS and/or WhatsApp
   * based on the current configuration in SMS_Providers
   * 
   * @param phoneNumber The phone number to check
   * @returns Support information for SMS and WhatsApp
   */
  @Get('check-support')
  async checkSupport(@Query('phoneNumber') phoneNumber: string): Promise<{success: boolean} & MessageSupportResponse> {
    if (!phoneNumber) {
      throw new BadRequestException('Phone number is required');
    }
    
    try {
      const supportInfo = await this.messagingService.checkMessageSupport(phoneNumber);
      return {
        success: true,
        ...supportInfo
      };
    } catch (error) {
      throw new BadRequestException('Failed to check message support: ' + error.message);
    }
  }
} 