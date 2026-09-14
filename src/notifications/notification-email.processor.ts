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
      this.logger.warn(`SMTP not configured; skipped email to ${data.to}`);
      return;
    }

    const { inlineImage, imageUrl } = await resolveInlineEmailImage(
      data.imageSource,
      (stored) => this.storage.getObjectBuffer(stored),
      { publicUrlForKey: (key) => this.storage.objectPublicUrl(key) },
    );

    const type = data.meta?.type as NotificationType | undefined;
    const streakUpdate =
      type === 'streak_update' ||
      type === 'streak_at_risk' ||
      type === 'streak_milestone';
    const leaderboard =
      type === 'weekly_rank' ||
      type === 'rank_passed' ||
      type === 'global_top';

    let weekDays: StreakWeekDay[] = [];
    const includeProgress = data.meta?.showProgress !== false;
    if (streakUpdate && includeProgress && data.meta?.userId) {
      const today =
        data.meta.todayYmd ?? new Date().toISOString().slice(0, 10);
      weekDays = await this.weekDaysForUser(data.meta.userId, today);
    }

    const includeBoard = data.meta?.showLeaderboard !== false;
    const leaderboardRows = (data.meta?.leaderboardRows ??
      []) as LeaderboardEmailRow[];

    await this.mailService.sendAnnouncement({
      to: data.to,
      title: data.title,
      body: data.body,
      inlineImage,
      imageUrl,
      imageAlt: data.title,
      ...(streakUpdate
        ? {
            variant: 'streak_update' as const,
            weekDays,
            footer:
              type === 'streak_milestone'
                ? "You're on fire — keep it going tomorrow!"
                : type === 'streak_update'
                  ? 'Keep your streak alive with a pomodoro!'
                  : 'Save your streak with a pomodoro!',
            cta: { label: 'START A POMODORO', url: APP_LINK },
          }
        : {}),
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
            cta: { label: 'VIEW LEADERBOARD', url: APP_LINK },
          }
        : {}),
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
      .map((r) => r.date);
    return buildWeekDaysFromStats(todayYmd, completed);
  }
}
