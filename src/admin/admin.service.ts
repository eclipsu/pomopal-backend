import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../entities/user.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationPreferences } from '../entities/notification-preferences.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { StreaksService } from '../streaks/streaks.service';
import { TemplatePickerService } from '../notifications/template-picker.service';
import { StorageService } from '../storage/storage.service';
import { renderTemplate } from '../notifications/template-render';
import { stripHtml } from '../mail/notification-card-email';
import { TestSendNotificationDto } from './dto/test-send.dto';
import { ReviveStreakDto } from './dto/revive-streak.dto';
import { BroadcastAnnouncementDto } from './dto/announcement.dto';
import { PreviewNotificationDto } from './dto/preview-notification.dto';

const BATCH_SIZE = 200;
const EMAIL_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(NotificationPreferences)
    private readonly prefsRepo: Repository<NotificationPreferences>,
    private readonly notifications: NotificationsService,
    private readonly streaks: StreaksService,
    private readonly templatePicker: TemplatePickerService,
    private readonly storage: StorageService,
  ) {}

  async listUsers(search?: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const q = search?.trim();

    const rows = q
      ? await this.users.find({
          where: [{ email: ILike(`%${q}%`) }, { name: ILike(`%${q}%`) }],
          select: ['id', 'email', 'name'],
          order: { email: 'ASC' },
          take,
        })
      : await this.users.find({
          select: ['id', 'email', 'name'],
          order: { email: 'ASC' },
          take,
        });

    return rows;
  }

  async getUserStreakStatus(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name'],
    });
    if (!user) throw new NotFoundException('User not found');

    const eligibility = await this.streaks.getReviveEligibility(userId);
    return { user, ...eligibility };
  }

  async testSend(dto: TestSendNotificationDto) {
    const user = await this.users.findOne({
      where: { id: dto.userId },
      select: ['id', 'email', 'name'],
    });
    if (!user) throw new NotFoundException('User not found');

    return this.notifications.sendTestNotification({
      userId: user.id,
      email: user.email,
      type: dto.type,
      templateId: dto.templateId,
      sendEmail: dto.sendEmail ?? true,
      context: {
        streak: dto.streak ?? 7,
        daysAway: dto.daysAway ?? 5,
        isLastChance: dto.isLastChance ?? false,
        completedSessions: 10,
        today: new Date().toISOString().slice(0, 10),
      },
    });
  }

  async reviveStreak(dto: ReviveStreakDto) {
    const user = await this.users.findOne({
      where: { id: dto.userId },
      select: ['id', 'email', 'name'],
    });
    if (!user) throw new NotFoundException('User not found');

    const eligibility = await this.streaks.getReviveEligibility(user.id);
    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason);
    }

    const content = await this.resolveMessageContent({
      templateId: dto.templateId,
      title: dto.title,
      body: dto.body,
      imageKey: dto.image_key,
      context: { streak: eligibility.current_streak },
      fallbackTitle: 'Streak restored',
      fallbackBody: `We restored your ${eligibility.current_streak}-day streak. Thank you for using Pomopal — let's keep it going!`,
    });

    const reviveResult = await this.streaks.reviveStreak(user.id);

    const notification = await this.notifications.sendAdminDirectMessage({
      userId: user.id,
      email: user.email,
      type: 'announcement',
      title: content.title,
      body: content.plainBody,
      htmlBody: content.htmlBody,
      imageSource: content.imageSource,
      sendEmail: dto.sendEmail ?? true,
      dedupeKey: `streak_revive:${user.id}:${Date.now()}`,
    });

    return {
      ...reviveResult,
      user: { id: user.id, email: user.email, name: user.name },
      notification,
      message: content,
    };
  }

  async broadcastAnnouncement(dto: BroadcastAnnouncementDto) {
    const content = await this.resolveMessageContent({
      templateId: dto.templateId,
      title: dto.title,
      body: dto.body,
      imageKey: dto.image_key,
      context: { today: new Date().toISOString().slice(0, 10) },
      fallbackTitle: 'Announcement',
      fallbackBody: '',
      requireBody: true,
    });

    const allUsers = await this.users.find({ select: ['id', 'email'] });
    if (!allUsers.length) {
      return { inserted: 0, skipped: 0, emailed: 0, emailFailed: 0, dryRun: dto.dryRun ?? false };
    }

    if (dto.dryRun) {
      return {
        dryRun: true,
        users: allUsers.length,
        title: content.title,
        body: content.htmlBody,
        sendEmail: dto.sendEmail ?? true,
      };
    }

    const runId = randomUUID().slice(0, 8);
    let inserted = 0;
    let skipped = 0;
    let emailed = 0;
    let emailFailed = 0;

    for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
      const batch = allUsers.slice(i, i + BATCH_SIZE);
      const dedupeKeys = batch.map((u) => `announcement:${runId}:${u.id}`);

      const existing = await this.notificationsRepo.find({
        where: { dedupe_key: In(dedupeKeys) },
        select: ['dedupe_key'],
      });
      const existingSet = new Set(existing.map((r) => r.dedupe_key));

      const prefs = await this.prefsRepo.find({
        where: { user_id: In(batch.map((u) => u.id)) },
      });
      const prefsMap = new Map(prefs.map((p) => [p.user_id, p]));

      const toNotify = batch.filter((u) => {
        if (existingSet.has(`announcement:${runId}:${u.id}`)) return false;
        const pref = prefsMap.get(u.id);
        return pref ? pref.product_announcements : true;
      });

      if (toNotify.length) {
        await this.notificationsRepo.insert(
          toNotify.map((u) =>
            this.notificationsRepo.create({
              user_id: u.id,
              type: 'announcement',
              title: content.title,
              body: content.plainBody,
              dedupe_key: `announcement:${runId}:${u.id}`,
              read_at: null,
            }),
          ),
        );
        inserted += toNotify.length;
      }
      skipped += batch.length - toNotify.length;

      if (dto.sendEmail !== false) {
        for (const user of toNotify) {
          try {
            await this.notifications.sendAdminEmail({
              to: user.email,
              title: content.title,
              htmlBody: content.htmlBody,
              imageSource: content.imageSource,
            });
            emailed += 1;
          } catch {
            emailFailed += 1;
          }
          await sleep(EMAIL_DELAY_MS);
        }
      }
    }

    return { inserted, skipped, emailed, emailFailed, runId };
  }

  async previewNotification(dto: PreviewNotificationDto) {
    const context: Record<string, unknown> = {
      streak: dto.streak ?? 7,
      daysAway: dto.daysAway ?? 5,
      isLastChance: dto.isLastChance ?? false,
      today: new Date().toISOString().slice(0, 10),
    };

    if (dto.userId) {
      const eligibility = await this.streaks.getReviveEligibility(dto.userId);
      context.streak = eligibility.current_streak;
    }

    const hasContent =
      dto.templateId || dto.body?.trim() || dto.title?.trim();
    if (!hasContent) {
      throw new BadRequestException('Nothing to preview yet');
    }

    const content = await this.resolveMessageContent({
      templateId: dto.templateId,
      title: dto.title,
      body: dto.body,
      imageKey: dto.image_key,
      context,
      fallbackTitle: dto.title?.trim() || 'Notification',
      fallbackBody: dto.body?.trim() || '…',
      requireBody: false,
    });

    return {
      type: dto.type ?? 'announcement',
      title: content.title,
      body: content.htmlBody,
      plainBody: content.plainBody,
      imageUrl: this.resolvePublicImageUrl(content.imageSource),
    };
  }

  private resolvePublicImageUrl(imageSource?: string): string | undefined {
    if (!imageSource) return undefined;
    if (imageSource.startsWith('http')) return imageSource;
    return this.storage.objectPublicUrl(imageSource);
  }

  private async resolveMessageContent(params: {
    templateId?: string;
    title?: string;
    body?: string;
    imageKey?: string;
    context: Record<string, unknown>;
    fallbackTitle: string;
    fallbackBody: string;
    requireBody?: boolean;
  }) {
    let title = params.title?.trim() ?? '';
    let htmlBody = params.body?.trim() ?? '';
    let imageSource: string | undefined;

    if (params.templateId) {
      const template = await this.templatePicker.findById(params.templateId);
      if (!template) throw new NotFoundException('Template not found');
      title = renderTemplate(template.title, params.context);
      htmlBody = renderTemplate(template.body, params.context);
      imageSource = template.image_url ?? undefined;
    }

    if (params.imageKey?.trim()) {
      if (!this.storage.isValidTemplateImageKey(params.imageKey)) {
        throw new BadRequestException('Invalid image key');
      }
      imageSource = params.imageKey;
    }

    if (!title) title = params.fallbackTitle;
    if (!htmlBody) {
      if (params.requireBody && !params.templateId) {
        throw new BadRequestException('Title and body are required');
      }
      htmlBody = params.fallbackBody;
    }

    if (!htmlBody.trim()) {
      throw new BadRequestException('Message body cannot be empty');
    }

    const plainBody = stripHtml(htmlBody);
    return { title, htmlBody, plainBody, imageSource };
  }
}
