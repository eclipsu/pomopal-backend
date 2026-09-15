import { Test, TestingModule } from '@nestjs/testing';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

describe('PrivacyController', () => {
  let controller: PrivacyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [{ provide: PrivacyService, useValue: {} }],
    }).compile();

    controller = module.get<PrivacyController>(PrivacyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
