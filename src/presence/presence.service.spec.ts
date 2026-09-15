import { Test, TestingModule } from '@nestjs/testing';
import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        {
          provide: 'REDIS_CLIENT',
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            expire: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PresenceService>(PresenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
