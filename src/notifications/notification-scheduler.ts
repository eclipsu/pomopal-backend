import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Streak } from '../entities/streak.entity';
import { Session, SessionType } from '../entities/sessions.entity';
import { DailyStat } from '../entities/daily-stat.entity';
import { NotificationsService } from './notifications.service';
import {
  daysBetweenYmd,
  localHourInTz,
  normalizeTimezone,
  streakDateToYmd,
  todayInTz,
} from '../common/time';

const STREAK_NUDGE_HOURS = new Set([18, 19, 20, 21]);
const COMEBACK_HOUR = 10;
const MIN_SESSIONS_FOR_NUDGE = 5;
const COMEBACK_DAYS = 3;

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Streak)
    private readonly streakRepo: Repository<Streak>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(DailyStat)
    private readonly dailyStatRepo: Repository<DailyStat>,
    private readonly notifications: NotificationsService,
  ) {}

  /** Hourly — match users whose local time fits each nudge window. */
  @Cron('0 * * * *')
  async runScheduledNudges(): Promise<void> {
    const users = await this.userRepo.find({
      select: ['id', 'email', 'time_zone'],
    });

    for (const user of users) {
      const tz = normalizeTimezone(user.time_zone);
      const hour = localHourInTz(tz);
      const today = todayInTz(tz);

      try {
        if (STREAK_NUDGE_HOURS.has(hour)) {
          await this.maybeStreakAtRisk(user.id, user.email, tz, today);
        }

        if (hour === COMEBACK_HOUR) {
          await this.maybeComeback(user.id, user.email, tz, today);
        }

        const preferredHour = await this.preferredFocusHour(user.id, tz);
        const nudgeHour = preferredHour ?? 17;
        if (hour === nudgeHour) {
          await this.maybeDailyNudge(user.id, user.email, tz, today);
        }
      } catch (err) {
        this.logger.warn(
          `Notification scheduler skipped user ${user.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private async maybeStreakAtRisk(
    userId: string,
    email: string,
    tz: string,
    today: string,
  ): Promise<void> {
    const streak = await this.streakRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!streak || streak.current_streak <= 0) return;

    const lastActive = streakDateToYmd(streak.last_active_date, tz);
    if (!lastActive || lastActive === today) return;

    await this.notifications.notifyStreakAtRisk(
      userId,
      streak.current_streak,
      today,
      email,
    );
  }

  private async maybeDailyNudge(
    userId: string,
    email: string,
    tz: string,
    today: string,
  ): Promise<void> {
    const completedCount = await this.sessionRepo.count({
      where: {
        user: { id: userId },
        completed: true,
        type: SessionType.POMODORO,
      },
    });
    if (completedCount < MIN_SESSIONS_FOR_NUDGE) return;

    const stat = await this.dailyStatRepo.findOne({
      where: { user: { id: userId }, date: today },
    });
    if (stat && stat.session_count > 0) return;

    const streak = await this.streakRepo.findOne({
      where: { user: { id: userId } },
    });
    const lastActive = streak
      ? streakDateToYmd(streak.last_active_date, tz)
      : null;
    if (lastActive === today) return;

    await this.notifications.notifyDailyNudge(userId, today, email);
  }

  private async maybeComeback(
    userId: string,
    email: string,
    tz: string,
    today: string,
  ): Promise<void> {
    const lastSession = await this.sessionRepo.findOne({
      where: {
        user: { id: userId },
        completed: true,
        type: SessionType.POMODORO,
      },
      order: { ended_at: 'DESC' },
    });

    if (!lastSession?.ended_at) return;

    const lastFocusDate = streakDateToYmd(lastSession.ended_at, tz);
    if (!lastFocusDate) return;

    const daysAway = daysBetweenYmd(lastFocusDate, today);
    if (daysAway < COMEBACK_DAYS) return;

    await this.notifications.notifyComeback(userId, daysAway, email);
  }

  private async preferredFocusHour(
    userId: string,
    tz: string,
  ): Promise<number | null> {
    const rows = await this.sessionRepo
      .createQueryBuilder('s')
      .select(
        `EXTRACT(HOUR FROM s.started_at AT TIME ZONE :tz)`,
        'hour',
      )
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
}
