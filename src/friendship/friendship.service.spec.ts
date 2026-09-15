jest.mock('../streaks/streaks.service', () => ({
  StreaksService: class StreaksService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FriendshipService } from './friendship.service';
import { Friendship } from '../entities/friendship.entity';
import { User } from '../entities/user.entity';
import { UserPrivacy } from '../entities/user-privacy.entity';
import { Streak } from '../entities/streak.entity';
import { MailService } from '../mail/mail.service';
import { StreaksService } from '../streaks/streaks.service';
import { DailyStatsService } from '../daily-stats/daily-stats.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { PresenceService } from '../presence/presence.service';

describe('FriendshipService', () => {
  let service: FriendshipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendshipService,
        { provide: getRepositoryToken(Friendship), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(UserPrivacy), useValue: {} },
        { provide: getRepositoryToken(Streak), useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MailService, useValue: {} },
        { provide: StreaksService, useValue: {} },
        { provide: DailyStatsService, useValue: {} },
        { provide: LeaderboardService, useValue: {} },
        { provide: PresenceService, useValue: {} },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<FriendshipService>(FriendshipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
