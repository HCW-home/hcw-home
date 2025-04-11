import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationGateway } from './consultation.gateway';

describe('ConsultationGateway', () => {
  let gateway: ConsultationGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConsultationGateway],
    }).compile();

    gateway = module.get<ConsultationGateway>(ConsultationGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
