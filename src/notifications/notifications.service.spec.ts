import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

jest.mock('./notification-queue.service', () => ({
  NotificationQueueService: class NotificationQueueService {},
}));

import { NotificationsService } from './notifications.service';
import { Notification } from '../entities/notification.entity';
import { NotificationPreferences } from '../entities/notification-preferences.entity';
import { DailyStat } from '../entities/daily-stat.entity';
import { MailService } from '../mail/mail.service';
import { TemplatePickerService } from './template-picker.service';
import { StorageService } from '../storage/storage.service';
import { User } from '../entities/user.entity';
import { NotificationStatsService } from './notification-stats.service';
import { NotificationQueueService } from './notification-queue.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const notificationRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    create: jest.fn((row) => row),
  };

  const prefsRepo = {
    findOneBy: jest.fn(),
    save: jest.fn(),
    create: jest.fn((row) => row),
  };

  const dailyStatRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  const userRepo = {
    findOne: jest.fn().mockResolvedValue({
      name: 'Rajeev Shrestha',
      username: 'rajeev2',
    }),
  };

  const mailService = {
    sendAnnouncement: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
  };

  const templatePicker = {
    pickTemplate: jest.fn().mockResolvedValue(null),
    hasActiveTemplates: jest.fn().mockResolvedValue(false),
  };

  const storage = {
    resolveImageUrl: jest.fn().mockImplementation(async (url: string) => url),
    getObjectBuffer: jest.fn().mockResolvedValue(null),
    objectPublicUrl: jest.fn((key: string) => `https://cdn.example/${key}`),
  };

  const stats = {
    todayMinutes: jest.fn().mockResolvedValue(0),
    todaySessionCount: jest.fn().mockResolvedValue(0),
    allTimeMinutes: jest.fn().mockResolvedValue(0),
    weekMinutes: jest.fn().mockResolvedValue(0),
    weekSessionCount: jest.fn().mockResolvedValue(0),
  };

  const queue = {
    enqueuePomodoroCompleted: jest.fn().mockRejectedValue(new Error('no queue')),
    enqueueSendEmail: jest.fn().mockRejectedValue(new Error('no queue')),
    enqueueEvaluateUser: jest.fn(),
  };

  const leaderboard = {
    usersPassedOnWeek: jest.fn().mockResolvedValue([]),
    getGlobalWeekRank: jest.fn().mockResolvedValue(null),
    getGlobalWeekScore: jest.fn().mockResolvedValue(0),
    getGlobalWeekLeaderboard: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    dailyStatRepo.find.mockResolvedValue([]);
    queue.enqueuePomodoroCompleted.mockRejectedValue(new Error('no queue'));
    queue.enqueueSendEmail.mockRejectedValue(new Error('no queue'));
    stats.todaySessionCount.mockResolvedValue(0);
    stats.todayMinutes.mockResolvedValue(0);
    leaderboard.usersPassedOnWeek.mockResolvedValue([]);
    leaderboard.getGlobalWeekRank.mockResolvedValue(null);
    leaderboard.getGlobalWeekScore.mockResolvedValue(0);
    leaderboard.getGlobalWeekLeaderboard.mockResolvedValue([]);
    stats.weekMinutes.mockResolvedValue(0);
    stats.weekSessionCount.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        {
          provide: getRepositoryToken(NotificationPreferences),
          useValue: prefsRepo,
        },
        { provide: getRepositoryToken(DailyStat), useValue: dailyStatRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: MailService, useValue: mailService },
        { provide: TemplatePickerService, useValue: templatePicker },
        { provide: StorageService, useValue: storage },
        { provide: NotificationStatsService, useValue: stats },
        { provide: NotificationQueueService, useValue: queue },
        { provide: LeaderboardService, useValue: leaderboard },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('creates default preferences when missing', async () => {
    prefsRepo.findOneBy.mockResolvedValue(null);
    prefsRepo.save.mockImplementation(async (row) => ({ ...row, id: 'pref-1' }));

    const prefs = await service.ensurePreferences('user-1');

    expect(prefs.user_id).toBe('user-1');
    expect(prefsRepo.save).toHaveBeenCalled();
  });

  it('skips duplicate notifications by dedupe_key', async () => {
    notificationRepo.findOne.mockResolvedValue({ id: 'existing' });

    const result = await service.createIfNew({
      userId: 'user-1',
      type: 'daily_nudge',
      title: 'Daily Nudge',
      body: 'Stay hard.',
      dedupeKey: 'daily_nudge:user-1:2026-06-01',
    });

    expect(result).toBeNull();
    expect(notificationRepo.save).not.toHaveBeenCalled();
  });

  it('persists title and body separately', async () => {
    notificationRepo.findOne.mockResolvedValue(null);
    notificationRepo.save.mockImplementation(async (row) => ({
      ...row,
      id: 'n-1',
    }));

    await service.createIfNew({
      userId: 'user-1',
      type: 'daily_nudge',
      title: 'Daily Nudge',
      body: 'Stay hard.',
      dedupeKey: 'daily_nudge:user-1:2026-06-02',
    });

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Daily Nudge',
        body: 'Stay hard.',
      }),
    );
  });

  it('creates streak milestone when prefs allow updates', async () => {
    prefsRepo.findOneBy.mockResolvedValue({
      user_id: 'user-1',
      streak_updates: true,
      goal_updates: true,
      league_updates: true,
      daily_goal_minutes: 25,
    });
    notificationRepo.findOne.mockResolvedValue(null);
    notificationRepo.save.mockImplementation(async (row) => ({
      ...row,
      id: 'n-1',
    }));

    await service.onPomodoroComplete(
      'user-1',
      'session-1',
      7,
      'America/Chicago',
    );

    expect(notificationRepo.save).toHaveBeenCalled();
    const types = notificationRepo.save.mock.calls.map(
      (call: [{ type: string }]) => call[0].type,
    );
    expect(types).toContain('streak_milestone');
    expect(mailService.sendAnnouncement).not.toHaveBeenCalled();
  });

  it('emails streak milestone when address provided', async () => {
    prefsRepo.findOneBy.mockResolvedValue({
      user_id: 'user-1',
      streak_updates: true,
      goal_updates: true,
      league_updates: true,
      daily_goal_minutes: 25,
    });
    notificationRepo.findOne.mockResolvedValue(null);
    notificationRepo.save.mockImplementation(async (row) => ({
      ...row,
      id: 'n-1',
    }));

    await service.onPomodoroComplete(
      'user-1',
      'session-1',
      7,
      'America/Chicago',
      'user@example.com',
    );

    expect(mailService.sendAnnouncement).toHaveBeenCalledTimes(1);
    expect(mailService.sendAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        title: 'Streak Milestone',
        body: expect.any(String),
        imageAlt: 'Streak Milestone',
        variant: 'streak_update',
        weekDays: expect.any(Array),
        cta: expect.objectContaining({
          label: 'START A POMODORO',
          url: 'https://pomopal.lol',
        }),
      }),
    );
  });

  it('embeds template images inline when storage returns bytes', async () => {
    prefsRepo.findOneBy.mockResolvedValue({
      user_id: 'user-1',
      streak_nudges: true,
    });
    notificationRepo.findOne.mockResolvedValue(null);
    notificationRepo.save.mockImplementation(async (row) => ({
      ...row,
      id: 'n-1',
    }));
    templatePicker.hasActiveTemplates.mockResolvedValue(true);
    templatePicker.pickTemplate.mockResolvedValue({
      title: 'Hi {{streak}}',
      body: 'Body',
      image_url: 'notification-templates/test.webp',
    });
    storage.getObjectBuffer.mockResolvedValue({
      buffer: Buffer.from('img'),
      contentType: 'image/webp',
    });

    await service.notifyStreakAtRisk('user-1', 5, '2026-06-01', 'user@example.com');

    expect(mailService.sendAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'streak_update',
        weekDays: expect.any(Array),
        inlineImage: expect.objectContaining({
          cid: 'pomopal-notification-image',
          content: Buffer.from('img'),
        }),
      }),
    );
  });

  it('respects streak_nudges preference for at-risk', async () => {
    prefsRepo.findOneBy.mockResolvedValue({
      user_id: 'user-1',
      streak_nudges: false,
    });

    await service.notifyStreakAtRisk('user-1', 5, '2026-06-01', 'a@b.com');

    expect(notificationRepo.save).not.toHaveBeenCalled();
    expect(mailService.sendAnnouncement).not.toHaveBeenCalled();
  });
});
