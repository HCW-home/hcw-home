import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappTemplateService } from './whatsapp-template.service';

describe('WhatsappTemplateService', () => {
  let service: WhatsappTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappTemplateService],
    }).compile();

    service = module.get<WhatsappTemplateService>(WhatsappTemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
