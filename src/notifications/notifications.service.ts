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
import { StorageService } from '../storage/storage.service';
import { resolveInlineEmailImage } from '../mail/email-inline-image';

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
    private readonly storage: StorageService,
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

  async sendTestNotification(params: {
    userId: string;
    email: string;
    type: NotificationType;
    templateId?: string;
    sendEmail?: boolean;
    context: Record<string, unknown>;
  }) {
    let title: string;
    let body: string;
    let imageUrl = this.fallbackImageForType(params.type);
    let source: 'template' | 'fallback' = 'fallback';
    let templateName: string | null = null;

    if (params.templateId) {
      const template = await this.templatePicker.findById(params.templateId);
      if (!template) throw new NotFoundException('Template not found');
      title = renderTemplate(template.title, params.context);
      body = renderTemplate(template.body, params.context);
      imageUrl = template.image_url ?? imageUrl;
      source = 'template';
      templateName = template.name;
    } else {
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
        imageUrl = template.image_url ?? imageUrl;
        source = 'template';
        templateName = template.name;
      } else if (templatesConfigured) {
        throw new NotFoundException(
          'No eligible template for this type and context',
        );
      } else {
        const copy = this.fallbackCopyForType(params.type, params.context);
        title = copy.title;
        body = copy.body;
      }
    }

    const dedupeKey = `test:${params.type}:${params.userId}:${Date.now()}`;
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({
        user_id: params.userId,
        type: params.type,
        title,
        body,
        dedupe_key: dedupeKey,
        read_at: null,
      }),
    );

    let emailSent = false;
    if (params.sendEmail !== false) {
      await this.sendNudgeEmail(params.email, title, body, imageUrl);
      emailSent = this.mailService.isConfigured();
    }

    return {
      notification,
      title,
      body,
      source,
      templateName,
      emailSent,
    };
  }

  async sendAdminDirectMessage(params: {
    userId: string;
    email: string;
    type: NotificationType;
    title: string;
    body: string;
    htmlBody?: string;
    imageSource?: string;
    sendEmail?: boolean;
    dedupeKey: string;
  }) {
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        dedupe_key: params.dedupeKey,
        read_at: null,
      }),
    );

    let emailSent = false;
    if (params.sendEmail !== false) {
      await this.sendNudgeEmail(
        params.email,
        params.title,
        params.htmlBody ?? params.body,
        params.imageSource,
      );
      emailSent = this.mailService.isConfigured();
    }

    return { notification, emailSent };
  }

  async sendAdminEmail(params: {
    to: string;
    title: string;
    htmlBody: string;
    imageSource?: string;
  }): Promise<void> {
    await this.sendNudgeEmail(
      params.to,
      params.title,
      params.htmlBody,
      params.imageSource,
    );
  }

  private fallbackImageForType(type: NotificationType): string {
    switch (type) {
      case 'streak_at_risk':
        return IMAGES.mad;
      case 'streak_milestone':
        return IMAGES.yay;
      case 'daily_nudge':
      case 'comeback':
        return IMAGES.sad;
      default:
        return IMAGES.super;
    }
  }

  private fallbackCopyForType(
    type: NotificationType,
    context: Record<string, unknown>,
  ): { title: string; body: string } {
    const streak = Number(context.streak ?? 7);
    const daysAway = Number(context.daysAway ?? 5);
    const isLastChance = Boolean(context.isLastChance);

    switch (type) {
      case 'streak_at_risk':
        return streakAtRiskCopy(streak, isLastChance);
      case 'streak_milestone':
        return streakMilestoneCopy(streak);
      case 'daily_nudge':
        return dailyNudgeCopy();
      case 'comeback':
        return comebackCopy(daysAway);
      case 'focus_complete':
        return focusCompleteCopy();
      default:
        return { title: 'Test notification', body: 'This is a test from admin.' };
    }
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
    imageSource?: string,
  ): Promise<void> {
    if (!this.mailService.isConfigured()) {
      this.logger.warn(`SMTP not configured; skipped email to ${to}`);
      return;
    }
    try {
      const { inlineImage, imageUrl } = await resolveInlineEmailImage(
        imageSource,
        (stored) => this.storage.getObjectBuffer(stored),
        { publicUrlForKey: (key) => this.storage.objectPublicUrl(key) },
      );
      await this.mailService.sendAnnouncement({
        to,
        title,
        body,
        inlineImage,
        imageUrl,
        imageAlt: title,
      });
    } catch (err) {
      this.logger.error(
        `Failed to email ${to}: ${title}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
