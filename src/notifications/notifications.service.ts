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
import { TemplatePickerService } from './template-picker.service';
import { renderTemplate } from './template-render';

interface CreateParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
}

export const IMAGES = {
  mad: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-mad.png',
  sad: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-sad.png',
  yay: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-yay.png',
  super: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-super.png',
} as const;

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
    private readonly templatePicker: TemplatePickerService,
  ) {}

  async ensurePreferences(userId: string): Promise<NotificationPreferences> {
    const existing = await this.prefsRepo.findOneBy({ user_id: userId });
    if (existing) return existing;
    return this.prefsRepo.save(this.prefsRepo.create({ user_id: userId }));
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

  async onPomodoroComplete(
    userId: string,
    sessionId: string,
    currentStreak: number,
    _userTimeZone: string,
    email?: string,
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);

    if (prefs.streak_updates) {
      if ((STREAK_MILESTONES as readonly number[]).includes(currentStreak)) {
        await this.notifyWithTemplate({
          userId,
          type: 'streak_milestone',
          context: { streak: currentStreak },
          dedupeKey: dedupeKey(
            'streak_milestone',
            userId,
            String(currentStreak),
          ),
          fallback: () => streakMilestoneCopy(currentStreak),
          fallbackImage: IMAGES.yay,
          email,
        });
      }
    }
  }

  async notifyStreakAtRisk(
    userId: string,
    currentStreak: number,
    today: string,
    email?: string,
    isLastChance = false,
    extraContext: Record<string, unknown> = {},
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.streak_nudges) return;

    const suffix = isLastChance ? `${today}:last` : `${today}:early`;
    await this.notifyWithTemplate({
      userId,
      type: 'streak_at_risk',
      context: {
        streak: currentStreak,
        isLastChance,
        today,
        ...extraContext,
      },
      dedupeKey: dedupeKey('streak_at_risk', userId, suffix),
      fallback: () => streakAtRiskCopy(currentStreak, isLastChance),
      fallbackImage: IMAGES.mad,
      email,
    });
  }
  async notifyDailyNudge(
    userId: string,
    today: string,
    email?: string,
    extraContext: Record<string, unknown> = {},
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.streak_nudges) return;

    await this.notifyWithTemplate({
      userId,
      type: 'daily_nudge',
      context: { today, ...extraContext },
      dedupeKey: dedupeKey('daily_nudge', userId, today),
      fallback: () => dailyNudgeCopy(),
      fallbackImage: IMAGES.sad,
      email,
    });
  }

  async notifyComeback(
    userId: string,
    daysAway: number,
    email?: string,
    extraContext: Record<string, unknown> = {},
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.inactive_reminders) return;

    await this.notifyWithTemplate({
      userId,
      type: 'comeback',
      context: { daysAway, ...extraContext },
      dedupeKey: dedupeKey('comeback', userId, `${daysAway}d`),
      fallback: () => comebackCopy(daysAway),
      fallbackImage: IMAGES.sad,
      email,
    });
  }

  async userAllowsAnnouncements(userId: string): Promise<boolean> {
    const prefs = await this.ensurePreferences(userId);
    return prefs.product_announcements;
  }

  private async notifyWithTemplate(params: {
    userId: string;
    type: NotificationType;
    context: Record<string, unknown>;
    dedupeKey: string;
    fallback: () => { title: string; body: string };
    fallbackImage: string;
    email?: string;
  }): Promise<Notification | null> {
    let title: string;
    let body: string;
    let imageUrl = params.fallbackImage;

    const templatesConfigured = await this.templatePicker.hasActiveTemplates(
      params.type,
    );

    const template = await this.templatePicker.pickTemplate(
      params.type,
      params.context,
    );

    if (template) {
      title = renderTemplate(template.title, params.context);
      body = renderTemplate(template.body, params.context);
      imageUrl = template.image_url ?? params.fallbackImage;
    } else if (templatesConfigured) {
      this.logger.debug(
        `Skipped ${params.type} for ${params.userId}: no eligible template`,
      );
      return null;
    } else {
      const copy = params.fallback();
      title = copy.title;
      body = copy.body;
    }

    const created = await this.createIfNew({
      userId: params.userId,
      type: params.type,
      title,
      body,
      dedupeKey: params.dedupeKey,
    });

    if (created && params.email) {
      await this.sendNudgeEmail(params.email, title, body, imageUrl);
    }

    return created;
  }

  private async sendNudgeEmail(
    to: string,
    title: string,
    body: string,
    imageUrl?: string,
  ): Promise<void> {
    if (!this.mailService.isConfigured()) {
      this.logger.warn(`SMTP not configured; skipped email to ${to}`);
      return;
    }
    try {
      await this.mailService.sendAnnouncement({ to, title, body, imageUrl });
    } catch (err) {
      this.logger.error(
        `Failed to email ${to}: ${title}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
