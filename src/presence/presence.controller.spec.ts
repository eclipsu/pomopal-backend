import { Test, TestingModule } from '@nestjs/testing';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

describe('PresenceController', () => {
  let controller: PresenceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PresenceController],
      providers: [PresenceService],
    }).compile();

    controller = module.get<PresenceController>(PresenceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
