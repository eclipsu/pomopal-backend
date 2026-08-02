import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PrivacyService } from './privacy.service';
import { UserPrivacy } from 'src/entities/user-privacy.entity';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

describe('PrivacyService', () => {
  let service: PrivacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyService,
        { provide: getRepositoryToken(UserPrivacy), useValue: {} },
        {
          provide: LeaderboardService,
          useValue: {
            updateGlobalAllTime: jest.fn(),
            invalidateForUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PrivacyService>(PrivacyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
