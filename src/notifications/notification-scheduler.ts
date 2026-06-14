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
  yesterdayInTz,
} from '../common/time';

// 9 PM = 3 hours before midnight
// 11 PM = 1 hour before midnight
const STREAK_NUDGE_HOURS = new Set([21, 23]);
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

  @Cron('0 * * * *')
  async runScheduledNudges(): Promise<void> {
    const users = await this.userRepo.find({
      select: ['id', 'email', 'time_zone'],
    });

    for (const user of users) {
      const tz = normalizeTimezone(user.time_zone);
      const hour = localHourInTz(tz);
      const today = todayInTz(tz);

      const userSeed = parseInt(user.id.replace(/-/g, '').slice(0, 8), 16);
      const delayMs = (userSeed % 59) * 60 * 1000; // 0–58 min delay

      try {
        if (STREAK_NUDGE_HOURS.has(hour)) {
          setTimeout(() => {
            void this.maybeStreakAtRisk(user.id, user.email, tz, today, hour);
          }, delayMs);
        }

        if (hour === COMEBACK_HOUR) {
          setTimeout(() => {
            void this.maybeComeback(user.id, user.email, tz, today);
          }, delayMs);
        }

        const preferredHour = await this.preferredFocusHour(user.id, tz);
        const nudgeHour = preferredHour ?? 17;
        if (hour === nudgeHour) {
          setTimeout(() => {
            void this.maybeDailyNudge(user.id, user.email, tz, today);
          }, delayMs);
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
    hour: number,
  ): Promise<void> {
    const streak = await this.streakRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!streak || streak.current_streak <= 0) return;

    const lastActive = streakDateToYmd(streak.last_active_date, tz);
    const yesterday = yesterdayInTz(tz);
    if (!lastActive || lastActive === today || lastActive !== yesterday) return;

    const stat = await this.dailyStatRepo.findOne({
      where: { user: { id: userId }, date: today },
    });
    if (stat && stat.session_count > 0) return; // completed today, don't nag

    const isLastChance = hour === 23;
    await this.notifications.notifyStreakAtRisk(
      userId,
      streak.current_streak,
      today,
      email,
      isLastChance,
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
    if (stat && stat.session_count > 0) return; // already used app today

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

    // if they used the app today don't send
    const stat = await this.dailyStatRepo.findOne({
      where: { user: { id: userId }, date: today },
    });
    if (stat && stat.session_count > 0) return;

    await this.notifications.notifyComeback(userId, daysAway, email);
  }
  private async preferredFocusHour(
    userId: string,
    tz: string,
  ): Promise<number | null> {
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
}
