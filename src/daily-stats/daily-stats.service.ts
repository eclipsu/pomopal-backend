/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DailyStat } from 'src/entities/daily-stat.entity';
import { Session, SessionType } from 'src/entities/sessions.entity';
import { Between, QueryFailedError, Repository } from 'typeorm';
import { normalizeTimezone, toUserDate } from '../common/time';
import { StreaksService } from 'src/streaks/streaks.service';
import { User } from 'src/entities/user.entity';
import { DailyStatDto } from './dto/daily-stat.dto.ts';
import { hashSessionName } from '../common/session-name.util';

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dt.toLocaleDateString('en-CA');
}

function statDateKey(date: string | Date): string {
  if (typeof date === 'string') {
    return date.slice(0, 10);
  }
  if (date instanceof Date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(date).slice(0, 10);
}

function isDuplicateDailyStatError(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err as QueryFailedError & { driverError?: { code?: string } }).driverError
      ?.code === '23505'
  );
}

@Injectable()
export class DailyStatsService {
  constructor(
    @InjectRepository(DailyStat) private dailyStatRepo: Repository<DailyStat>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
    private readonly streaks: StreaksService,
  ) {}

  async getDailyStat(userId: string, date?: string): Promise<DailyStatDto> {
    let queryDate = date;

    if (!queryDate) {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['time_zone'],
      });
      const tz = normalizeTimezone(user?.time_zone);
      queryDate = toUserDate(new Date(), tz);
    }

    const stats = await this.dailyStatRepo.findOne({
      where: { user: { id: userId }, date: queryDate },
    });

    if (stats) return stats;

    return { date: queryDate, total_focus_minutes: 0, session_count: 0 };
  }

  async getRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<DailyStatDto[]> {
    const existingStats = await this.dailyStatRepo.find({
      where: { user: { id: userId }, date: Between(from, to) },
      order: { date: 'ASC' },
    });

    const statsMap = new Map(
      existingStats.map((s) => [statDateKey(s.date), s]),
    );
    const results: DailyStat[] = [];

    for (let dateStr = from; dateStr <= to; dateStr = addDaysYmd(dateStr, 1)) {
      results.push(
        statsMap.get(dateStr) ??
          ({
            date: dateStr,
            total_focus_minutes: 0,
            session_count: 0,
          } as DailyStat),
      );
    }

    return results.map((r) => ({
      date: statDateKey(r.date),
      total_focus_minutes: r.total_focus_minutes ?? 0,
      session_count: r.session_count ?? 0,
    }));
  }

  /** Non-zero focus days only — for contribution graphs / profiles. */
  async getActiveDays(
    userId: string,
    from: string,
    to: string,
  ): Promise<{ date: string; minutes: number }[]> {
    const rows = await this.dailyStatRepo
      .createQueryBuilder('d')
      .select('d.date', 'date')
      .addSelect('d.total_focus_minutes', 'minutes')
      .where('d.userId = :uid', { uid: userId })
      .andWhere('d.date BETWEEN :from AND :to', { from, to })
      .andWhere('d.total_focus_minutes > 0')
      .orderBy('d.date', 'ASC')
      .getRawMany<{ date: string | Date; minutes: string | number }>();

    return rows.map((r) => ({
      date: statDateKey(r.date),
      minutes: Number(r.minutes) || 0,
    }));
  }

  async getTotalHours(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<{ total_hours: number; total_minutes: number }> {
    const where: any = { user: { id: userId } };
    if (from && to) where.date = Between(from, to);

    const stats = await this.dailyStatRepo.find({ where });
    const totalMinutes = stats.reduce(
      (sum, s) => sum + (s.total_focus_minutes ?? 0),
      0,
    );

    return {
      total_hours: Math.round((totalMinutes / 60) * 100) / 100,
      total_minutes: totalMinutes,
    };
  }

  private async sumDailyFocusMinutes(userId: string): Promise<number> {
    const row = await this.dailyStatRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.total_focus_minutes), 0)', 'total')
      .where('d.userId = :uid', { uid: userId })
      .getRawOne<{ total: string }>();

    return parseInt(row?.total ?? '0', 10);
  }

  /** Read cached all-time total; backfill from daily_stats when the column is null. */
  async getAllTimeFocusMinutes(userId: string): Promise<number> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'all_time_focus_minutes'],
    });
    if (!user) return 0;

    if (user.all_time_focus_minutes != null) {
      return user.all_time_focus_minutes;
    }

    const total = await this.sumDailyFocusMinutes(userId);
    await this.userRepo.update(userId, { all_time_focus_minutes: total });
    return total;
  }

  async getTotalFocusMinutes(userId: string): Promise<number> {
    return this.getAllTimeFocusMinutes(userId);
  }

  private async bumpAllTimeFocusMinutes(
    userId: string,
    minutes: number,
  ): Promise<void> {
    if (minutes <= 0) return;

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'all_time_focus_minutes'],
    });
    if (!user) return;

    if (user.all_time_focus_minutes == null) {
      const total = await this.sumDailyFocusMinutes(userId);
      await this.userRepo.update(userId, { all_time_focus_minutes: total });
      return;
    }

    await this.userRepo.update(userId, {
      all_time_focus_minutes: user.all_time_focus_minutes + minutes,
    });
  }

  async applyMinutes(
    userId: string,
    sessionDate: Date,
    userTimeZone: string,
    minutes: number,
    sessionCount = 0,
  ) {
    if (minutes <= 0 && sessionCount <= 0) {
      return null;
    }

    const date = toUserDate(sessionDate, normalizeTimezone(userTimeZone));

    const applyToExisting = async () => {
      const stat = await this.dailyStatRepo.findOne({
        where: { user: { id: userId }, date },
      });
      if (!stat) return null;
      stat.total_focus_minutes += minutes;
      stat.session_count += sessionCount;
      return this.dailyStatRepo.save(stat);
    };

    const touchStreak = async () => {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user) await this.streaks.update(user, date);
    };

    const updated = await applyToExisting();
    if (updated) {
      await touchStreak();
      if (minutes > 0) await this.bumpAllTimeFocusMinutes(userId, minutes);
      return updated;
    }

    try {
      const created = await this.dailyStatRepo.save(
        this.dailyStatRepo.create({
          user: { id: userId },
          date,
          total_focus_minutes: minutes,
          session_count: sessionCount,
        }),
      );
      await touchStreak();
      if (minutes > 0) await this.bumpAllTimeFocusMinutes(userId, minutes);
      return created;
    } catch (err) {
      if (!isDuplicateDailyStatError(err)) throw err;
      const retried = await applyToExisting();
      if (!retried) {
        throw err;
      }
      await touchStreak();
      if (minutes > 0) await this.bumpAllTimeFocusMinutes(userId, minutes);
      return retried;
    }
  }

  async applySession(session: Session, userTimeZone: string) {
    return this.applyMinutes(
      session.user.id,
      session.started_at,
      userTimeZone,
      session.actual_duration_minutes ?? 0,
      1,
    );
  }

  /**
   * Named pomodoro breakdown grouped by session_name_hash.
   * Untitled sessions are omitted so the UI stays low-key.
   */
  async getSessionNameBreakdown(userId: string, limit = 20) {
    const untitledHash = hashSessionName('Untitled Session');
    const take = Math.min(Math.max(limit, 1), 50);

    const rows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.session_name_hash', 'session_name_hash')
      .addSelect(
        '(ARRAY_AGG(s.session_name ORDER BY s.started_at DESC))[1]',
        'session_name',
      )
      .addSelect('COUNT(*)::int', 'session_count')
      .addSelect(
        'COALESCE(SUM(s.actual_duration_minutes), 0)::int',
        'total_minutes',
      )
      .addSelect('MAX(s.started_at)', 'last_session_at')
      .where('s.userId = :userId', { userId })
      .andWhere('s.type = :type', { type: SessionType.POMODORO })
      .andWhere('s.session_name_hash IS NOT NULL')
      .andWhere('s.session_name_hash != :untitledHash', { untitledHash })
      .groupBy('s.session_name_hash')
      .orderBy('total_minutes', 'DESC')
      .addOrderBy('session_count', 'DESC')
      .limit(take)
      .getRawMany<{
        session_name_hash: string;
        session_name: string;
        session_count: string | number;
        total_minutes: string | number;
        last_session_at: string | Date;
      }>();

    return rows.map((r) => ({
      session_name_hash: r.session_name_hash,
      session_name: r.session_name || 'Untitled Session',
      session_count: Number(r.session_count) || 0,
      total_minutes: Number(r.total_minutes) || 0,
      date: statDateKey(r.last_session_at),
    }));
  }
}
