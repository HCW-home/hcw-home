import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MessageSupportResponse, ProviderSupport } from './messaging.types';

@Injectable()
export class MessagingService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Check if a phone number can receive SMS and/or WhatsApp messages
   * based on the configured SMS_Providers
   * 
   * @param phoneNumber The phone number to check
   * @returns Support information for SMS and WhatsApp
   */
  async checkMessageSupport(phoneNumber: string): Promise<MessageSupportResponse> {
    // Clean the phone number (remove spaces, dashes, etc.)
    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    console.log('Checking support for phone number:', phoneNumber);
    console.log('Cleaned phone number:', cleanNumber);
    
    // Get all active providers from the database - select only needed fields to avoid BigInt serialization issues
    const allProviders = await this.db.sMS_Providers.findMany({
      where: { isDisabled: false },
      orderBy: { order: 'asc' }, 
      select: {
        id: true,
        provider: true,
        prefix: true,
        order: true,
        isWhatsapp: true,
        isDisabled: true
        // Exclude createdAt and updatedAt which are BigInt
      }
    });
    
    console.log('Found providers:', allProviders);
    
    // Find matching providers based on prefix
    const matchingProviders = allProviders.filter(provider => {
      console.log(`Comparing: "${cleanNumber}" starts with "${provider.prefix}"?`);
      // Handle prefixes with/without + character for more robust matching
      const providerPrefix = provider.prefix.replace(/^\+/, '');
      const numberToCheck = cleanNumber.replace(/^\+/, '');
      const isMatch = numberToCheck.startsWith(providerPrefix);
      console.log(`Result: ${isMatch} (${numberToCheck} starts with ${providerPrefix})`);
      return isMatch;
    });
    
    console.log('Matching providers:', matchingProviders);
    
    // Separate SMS and WhatsApp providers
    const smsProviders: ProviderSupport[] = matchingProviders
      .filter(provider => !provider.isWhatsapp)
      .map(p => ({ provider: p.provider, order: p.order }));
      
    const whatsappProviders: ProviderSupport[] = matchingProviders
      .filter(provider => provider.isWhatsapp)
      .map(p => ({ provider: p.provider, order: p.order }));
    
    console.log('SMS Providers:', smsProviders);
    console.log('WhatsApp Providers:', whatsappProviders);
    
    return {
      canSendSMS: smsProviders.length > 0,
      canSendWhatsapp: whatsappProviders.length > 0,
      smsProviders,
      whatsappProviders,
    };
  }
  
  /**
   * Clean a phone number by removing non-digit characters
   * except for the leading + sign
   */
  private cleanPhoneNumber(phoneNumber: string): string {
    // First trim any whitespace
    let cleanedNumber = phoneNumber.trim();
    // Check if it starts with +
    const hasPlus = cleanedNumber.startsWith('+');
    // Remove all non-digit characters
    cleanedNumber = cleanedNumber.replace(/\D/g, '');
    // Add back the + if it was there
    if (hasPlus) {
      cleanedNumber = '+' + cleanedNumber;
    }
    return cleanedNumber;
  }
} 