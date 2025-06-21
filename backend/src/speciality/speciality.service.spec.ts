import { Test, TestingModule } from '@nestjs/testing';
import { SpecialityService } from './speciality.service';

describe('SpecialityService', () => {
  let service: SpecialityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpecialityService],
    }).compile();

    service = module.get<SpecialityService>(SpecialityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
