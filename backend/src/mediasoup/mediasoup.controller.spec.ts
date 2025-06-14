import { Test, TestingModule } from '@nestjs/testing';
import { MediasoupServerController } from './mediasoup.controller';
import { MediasoupServerService } from './mediasoup.service';

describe('MediasoupController', () => {
  let controller: MediasoupServerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediasoupServerController],
      providers: [MediasoupServerService],
    }).compile();

    controller = module.get<MediasoupServerController>(
      MediasoupServerController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
