import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationController } from './consultation.controller';

describe('ConsultationController', () => {
  let controller: ConsultationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsultationController],
    }).compile();

    controller = module.get<ConsultationController>(ConsultationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
