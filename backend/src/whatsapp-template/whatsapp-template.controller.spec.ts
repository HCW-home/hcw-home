import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappTemplateController } from './whatsapp-template.controller';
import { WhatsappTemplateService } from './whatsapp-template.service';

describe('WhatsappTemplateController', () => {
  let controller: WhatsappTemplateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappTemplateController],
      providers: [WhatsappTemplateService],
    }).compile();

    controller = module.get<WhatsappTemplateController>(WhatsappTemplateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
