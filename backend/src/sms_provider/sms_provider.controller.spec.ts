import { Test, TestingModule } from '@nestjs/testing';
import { SmsProviderController } from './sms_provider.controller';
import { SmsProviderService } from './sms_provider.service';

describe('SmsProviderController', () => {
  let controller: SmsProviderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SmsProviderController],
      providers: [SmsProviderService],
    }).compile();

    controller = module.get<SmsProviderController>(SmsProviderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
