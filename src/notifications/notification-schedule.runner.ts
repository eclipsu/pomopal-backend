import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Streak } from '../entities/streak.entity';
import { Session, SessionType } from '../entities/sessions.entity';
import { DailyStat } from '../entities/daily-stat.entity';
import { NotificationsService } from './notifications.service';
import { NotificationStatsService } from './notification-stats.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  daysBetweenYmd,
  streakDateToYmd,
} from '../common/time';
import { STREAK_GRACE_DAYS } from '../streaks/streak.constants';
import type { EvaluateUserJob } from './notification-jobs.types';

const MIN_SESSIONS_FOR_NUDGE = 5;
const COMEBACK_DAYS = STREAK_GRACE_DAYS + 1;

@Injectable()
export class NotificationScheduleRunner {
  private readonly logger = new Logger(NotificationScheduleRunner.name);

  constructor(
    @InjectRepository(Streak)
    private readonly streakRepo: Repository<Streak>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(DailyStat)
    private readonly dailyStatRepo: Repository<DailyStat>,
    private readonly notifications: NotificationsService,
    private readonly stats: NotificationStatsService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  async evaluateUser(job: EvaluateUserJob): Promise<void> {
    for (const check of job.checks) {
      try {
        switch (check) {
          case 'streak_at_risk':
            await this.maybeStreakAtRisk(job);
            break;
          case 'comeback':
            await this.maybeComeback(job);
            break;
          case 'streak_update':
            await this.maybeStreakUpdate(job);
            break;
          case 'daily_nudge':
            await this.maybeDailyNudge(job);
            break;
          case 'weekly_rank':
            await this.maybeWeeklyRank(job);
            break;
        }
      } catch (err) {
        this.logger.warn(
          `${check} failed for ${job.userId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async preferredFocusHour(userId: string, tz: string): Promise<number | null> {
    const rows = await this.sessionRepo
      .createQueryBuilder('s')
      .select(`EXTRACT(HOUR FROM s.started_at AT TIME ZONE :tz)`, 'hour')
      .addSelect('COUNT(*)', 'cnt')
      .where('s.userId = :userId', { userId })
      .andWhere('s.completed = true')
      .andWhere('s.type = :type', { type: SessionType.POMODORO })
      .groupBy('hour')
      .orderBy('cnt', 'DESC')
      .setParameter('tz', tz)
      .limit(1)
      .getRawOne<{ hour: string }>();

    if (!rows?.hour) return null;
    return Number(rows.hour);
  }

  private async maybeStreakUpdate(job: EvaluateUserJob): Promise<void> {
    const streak = await this.streakRepo.findOne({
      where: { user: { id: job.userId } },
    });
    if (!streak || streak.current_streak <= 0) return;

    const lastActive = streakDateToYmd(streak.last_active_date, job.tz);
    if (!lastActive) return;

    const gap = daysBetweenYmd(lastActive, job.today);
    if (gap > STREAK_GRACE_DAYS) return;

    await this.notifications.notifyStreakUpdate(
      job.userId,
      streak.current_streak,
      job.today,
      job.email,
      { today: job.today, streak: streak.current_streak },
    );
  }

  private async maybeStreakAtRisk(job: EvaluateUserJob): Promise<void> {
    const streak = await this.streakRepo.findOne({
      where: { user: { id: job.userId } },
    });
    if (!streak || streak.current_streak <= 0) return;

    const lastActive = streakDateToYmd(streak.last_active_date, job.tz);
    if (!lastActive || lastActive === job.today) return;

    const gap = daysBetweenYmd(lastActive, job.today);
    if (gap < 1 || gap > STREAK_GRACE_DAYS) return;

    const stat = await this.dailyStatRepo.findOne({
      where: { user: { id: job.userId }, date: job.today },
    });
    if (stat && stat.session_count > 0) return;

    const graceDaysRemaining = STREAK_GRACE_DAYS - gap;
    const isLastChance = graceDaysRemaining === 0 && job.hour === 23;
    await this.notifications.notifyStreakAtRisk(
      job.userId,
      streak.current_streak,
      job.today,
      job.email,
      isLastChance,
      {
        today: job.today,
        graceDays: STREAK_GRACE_DAYS,
        graceDaysRemaining,
        daysAway: gap,
      },
    );
  }

  private async maybeDailyNudge(job: EvaluateUserJob): Promise<void> {
    const completedCount = await this.sessionRepo.count({
      where: {
        user: { id: job.userId },
        completed: true,
        type: SessionType.POMODORO,
      },
    });
    if (completedCount < MIN_SESSIONS_FOR_NUDGE) return;

    const stat = await this.dailyStatRepo.findOne({
      where: { user: { id: job.userId }, date: job.today },
    });
    if (stat && stat.session_count > 0) return;

    const streak = await this.streakRepo.findOne({
      where: { user: { id: job.userId } },
    });
    const lastActive = streak
      ? streakDateToYmd(streak.last_active_date, job.tz)
      : null;
    if (lastActive === job.today) return;

    await this.notifications.notifyDailyNudge(job.userId, job.today, job.email, {
      streak: streak?.current_streak ?? 0,
      completedSessions: completedCount,
      today: job.today,
    });
  }

  private async maybeComeback(job: EvaluateUserJob): Promise<void> {
    const lastSession = await this.sessionRepo.findOne({
      where: {
        user: { id: job.userId },
        completed: true,
        type: SessionType.POMODORO,
      },
      order: { ended_at: 'DESC' },
    });

    if (!lastSession?.ended_at) return;

    const lastFocusDate = streakDateToYmd(lastSession.ended_at, job.tz);
    if (!lastFocusDate) return;

    const daysAway = daysBetweenYmd(lastFocusDate, job.today);
    if (daysAway < COMEBACK_DAYS) return;

    const stat = await this.dailyStatRepo.findOne({
      where: { user: { id: job.userId }, date: job.today },
    });
    if (stat && stat.session_count > 0) return;

    await this.notifications.notifyComeback(job.userId, daysAway, job.email, {
      today: job.today,
    });
  }

  private async maybeWeeklyRank(job: EvaluateUserJob): Promise<void> {
    const weekMinutes = await this.stats.weekMinutes(job.userId, job.today);
    if (weekMinutes <= 0) return;
    const weekSessions = await this.stats.weekSessionCount(
      job.userId,
      job.today,
    );
    const rank = await this.leaderboard.getGlobalWeekRank(job.userId);
    await this.notifications.notifyWeeklyRank({
      userId: job.userId,
      email: job.email,
      today: job.today,
      weekMinutes,
      weekSessions,
      rank,
    });
  }
}
