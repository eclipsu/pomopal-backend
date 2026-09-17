import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { resolveInlineEmailImage } from '../mail/email-inline-image';
import {
  addDaysYmd,
  buildWeekDaysFromStats,
  StreakWeekDay,
} from '../mail/streak-update-email';
import type { LeaderboardEmailRow } from '../mail/leaderboard-email';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { DailyStat } from '../entities/daily-stat.entity';
import { JOB_SEND_EMAIL, QUEUE_EMAIL } from '../queue/queue.constants';
import type { SendEmailJob } from './notification-jobs.types';
import { APP_LINK } from './notification-copy';
import type { NotificationType } from '../entities/notification.entity';

function supportsWeeklyProgress(type?: NotificationType): boolean {
  return (
    type === 'streak_update' ||
    type === 'streak_at_risk' ||
    type === 'streak_milestone' ||
    type === 'daily_nudge' ||
    type === 'comeback'
  );
}

function isLeaderboardType(type?: NotificationType): boolean {
  return (
    type === 'weekly_rank' || type === 'rank_passed' || type === 'global_top'
  );
}

function flatEmailFooter(type?: NotificationType): string {
  if (type === 'streak_milestone') {
    return "You're on fire — keep it going tomorrow!";
  }
  if (type === 'streak_update') {
    return 'Keep your streak alive with a pomodoro!';
  }
  if (type === 'daily_nudge') {
    return 'A short focus session is enough to get back into rhythm.';
  }
  if (type === 'comeback') {
    return "We're glad you're here — start with one pomodoro.";
  }
  if (type === 'announcement') {
    return 'Thanks for being part of pomopal.';
  }
  return 'Save your streak with a pomodoro!';
}

function flatEmailCta(type?: NotificationType): { label: string; url: string } {
  if (isLeaderboardType(type)) {
    return { label: 'VIEW LEADERBOARD', url: APP_LINK };
  }
  if (type === 'announcement') {
    return { label: 'OPEN POMOPAL', url: APP_LINK };
  }
  return { label: 'START A POMODORO', url: APP_LINK };
}

function statDateKey(date: string | Date): string {
  if (typeof date === 'string') return date.slice(0, 10);
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(date).slice(0, 10);
}

@Processor(QUEUE_EMAIL)
export class NotificationEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationEmailProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly storage: StorageService,
    @InjectRepository(DailyStat)
    private readonly dailyStatRepo: Repository<DailyStat>,
  ) {
    super();
  }

  async process(job: Job<SendEmailJob>): Promise<void> {
    if (job.name !== JOB_SEND_EMAIL) return;
    const data = job.data;
    if (!this.mailService.isConfigured()) {
      const missing = this.mailService.missingConfigKeys().join(', ');
      this.logger.error(
        `SMTP not configured; cannot email ${data.to}. Missing: ${missing}`,
      );
      throw new Error(`SMTP not configured (missing ${missing})`);
    }

    const { inlineImage, imageUrl } = await resolveInlineEmailImage(
      data.imageSource,
      (stored) => this.storage.getObjectBuffer(stored),
      { publicUrlForKey: (key) => this.storage.objectPublicUrl(key) },
    );

    const type = data.meta?.type as NotificationType | undefined;
    const leaderboard = isLeaderboardType(type);
    const includeProgress =
      supportsWeeklyProgress(type) && data.meta?.showProgress !== false;
    const includeBoard = data.meta?.showLeaderboard !== false;

    let weekDays: StreakWeekDay[] = [];
    if (includeProgress && data.meta?.userId) {
      const today =
        data.meta.todayYmd ?? new Date().toISOString().slice(0, 10);
      weekDays = await this.weekDaysForUser(data.meta.userId, today);
    }

    const leaderboardRows = (data.meta?.leaderboardRows ??
      []) as LeaderboardEmailRow[];

    await this.mailService.sendAnnouncement({
      to: data.to,
      title: data.title,
      body: data.body,
      inlineImage,
      imageUrl,
      imageAlt: data.title,
      ...(leaderboard
        ? {
            variant: 'leaderboard' as const,
            leaderboardRows: includeBoard ? leaderboardRows : [],
            footer:
              type === 'global_top'
                ? 'Defend your spot — the board resets every week.'
                : type === 'rank_passed'
                  ? 'One more pomodoro can flip the board again.'
                  : 'Climb the board with another pomodoro!',
            cta: flatEmailCta(type),
          }
        : {
            variant: 'streak_update' as const,
            weekDays,
            footer: flatEmailFooter(type),
            cta: flatEmailCta(type),
          }),
    });
  }

  private async weekDaysForUser(
    userId: string,
    todayYmd: string,
  ): Promise<StreakWeekDay[]> {
    const from = addDaysYmd(todayYmd, -6);
    const rows = await this.dailyStatRepo.find({
      where: {
        user: { id: userId },
        date: Between(from, todayYmd),
      },
      select: ['date', 'session_count'],
    });
    const completed = rows
      .filter((r) => r.session_count > 0)
      .map((r) => statDateKey(r.date as string | Date));
    return buildWeekDaysFromStats(todayYmd, completed);
  }
}
