import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, IsNull } from 'typeorm';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationPreferences } from '../entities/notification-preferences.entity';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import {
  STREAK_MILESTONES,
  comebackCopy,
  dailyNudgeCopy,
  dedupeKey,
  focusCompleteCopy,
  streakAtRiskCopy,
  streakMilestoneCopy,
} from './notification-copy';
import { MailService } from '../mail/mail.service';

interface CreateParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err as QueryFailedError & { driverError?: { code?: string } }).driverError
      ?.code === '23505'
  );
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPreferences)
    private readonly prefsRepo: Repository<NotificationPreferences>,
    private readonly mailService: MailService,
  ) {}

  async ensurePreferences(userId: string): Promise<NotificationPreferences> {
    const existing = await this.prefsRepo.findOneBy({ user_id: userId });
    if (existing) return existing;
    return this.prefsRepo.save(
      this.prefsRepo.create({ user_id: userId }),
    );
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.ensurePreferences(userId);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const prefs = await this.ensurePreferences(userId);
    Object.assign(prefs, dto);
    return this.prefsRepo.save(prefs);
  }

  async createIfNew(params: CreateParams): Promise<Notification | null> {
    const existing = await this.notificationRepo.findOne({
      where: { dedupe_key: params.dedupeKey },
    });
    if (existing) return null;

    try {
      return await this.notificationRepo.save(
        this.notificationRepo.create({
          user_id: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          dedupe_key: params.dedupeKey,
          read_at: null,
        }),
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) return null;
      throw err;
    }
  }

  async listForUser(userId: string, limit = 50): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { user_id: userId, read_at: IsNull() },
    });
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const row = await this.notificationRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (!row.read_at) {
      row.read_at = new Date();
      await this.notificationRepo.save(row);
    }
    return row;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { user_id: userId, read_at: IsNull() },
      { read_at: new Date() },
    );
  }

  /** After a completed pomodoro — milestone + session celebration. */
  async onPomodoroComplete(
    userId: string,
    sessionId: string,
    currentStreak: number,
    _userTimeZone: string,
    email?: string,
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);

    if (prefs.streak_updates) {
      const { title, body } = focusCompleteCopy();
      const focusCreated = await this.createIfNew({
        userId,
        type: 'focus_complete',
        title,
        body,
        dedupeKey: dedupeKey('focus_complete', userId, sessionId),
      });
      if (focusCreated && email) {
        await this.sendNudgeEmail(email, title, body);
      }

      if ((STREAK_MILESTONES as readonly number[]).includes(currentStreak)) {
        const milestone = streakMilestoneCopy(currentStreak);
        const milestoneCreated = await this.createIfNew({
          userId,
          type: 'streak_milestone',
          title: milestone.title,
          body: milestone.body,
          dedupeKey: dedupeKey(
            'streak_milestone',
            userId,
            String(currentStreak),
          ),
        });
        if (milestoneCreated && email) {
          await this.sendNudgeEmail(email, milestone.title, milestone.body);
        }
      }
    }
  }

  async notifyStreakAtRisk(
    userId: string,
    currentStreak: number,
    today: string,
    email?: string,
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.streak_nudges) return;

    const copy = streakAtRiskCopy(currentStreak);
    const created = await this.createIfNew({
      userId,
      type: 'streak_at_risk',
      title: copy.title,
      body: copy.body,
      dedupeKey: dedupeKey('streak_at_risk', userId, today),
    });

    if (created && email) {
      await this.sendNudgeEmail(email, copy.title, copy.body);
    }
  }

  async notifyDailyNudge(
    userId: string,
    today: string,
    email?: string,
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.streak_nudges) return;

    const copy = dailyNudgeCopy();
    const created = await this.createIfNew({
      userId,
      type: 'daily_nudge',
      title: copy.title,
      body: copy.body,
      dedupeKey: dedupeKey('daily_nudge', userId, today),
    });

    if (created && email) {
      await this.sendNudgeEmail(email, copy.title, copy.body);
    }
  }

  async notifyComeback(
    userId: string,
    daysAway: number,
    email?: string,
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.inactive_reminders) return;

    const copy = comebackCopy(daysAway);
    const created = await this.createIfNew({
      userId,
      type: 'comeback',
      title: copy.title,
      body: copy.body,
      dedupeKey: dedupeKey('comeback', userId, `${daysAway}d`),
    });

    if (created && email) {
      await this.sendNudgeEmail(email, copy.title, copy.body);
    }
  }

  async userAllowsAnnouncements(userId: string): Promise<boolean> {
    const prefs = await this.ensurePreferences(userId);
    return prefs.product_announcements;
  }

  private async sendNudgeEmail(
    to: string,
    title: string,
    body: string,
  ): Promise<void> {
    if (!this.mailService.isConfigured()) {
      this.logger.warn(`SMTP not configured; skipped email to ${to}`);
      return;
    }

    try {
      await this.mailService.sendAnnouncement({ to, title, body });
    } catch (err) {
      this.logger.error(
        `Failed to email ${to}: ${title}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
