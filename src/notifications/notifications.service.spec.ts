import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from '../entities/notification.entity';
import { NotificationPreferences } from '../entities/notification-preferences.entity';
import { MailService } from '../mail/mail.service';
import { TemplatePickerService } from './template-picker.service';

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

  const mailService = {
    sendAnnouncement: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
  };

  const templatePicker = {
    pickTemplate: jest.fn().mockResolvedValue(null),
    hasActiveTemplates: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        {
          provide: getRepositoryToken(NotificationPreferences),
          useValue: prefsRepo,
        },
        { provide: MailService, useValue: mailService },
        { provide: TemplatePickerService, useValue: templatePicker },
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
