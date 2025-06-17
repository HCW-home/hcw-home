import { Test, TestingModule } from '@nestjs/testing';
import { SmsProviderService } from './sms_provider.service';

describe('SmsProviderService', () => {
  let service: SmsProviderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsProviderService],
    }).compile();

    service = module.get<SmsProviderService>(SmsProviderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
