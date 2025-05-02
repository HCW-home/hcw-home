export interface ProviderSupport {
  provider: string;
  order: number;
}

export interface MessageSupportResponse {
  canSendSMS: boolean;
  canSendWhatsapp: boolean;
  smsProviders: ProviderSupport[];
  whatsappProviders: ProviderSupport[];
} 