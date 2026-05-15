/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DailyStat } from 'src/entities/daily-stat.entity';
import { Session } from 'src/entities/sessions.entity';
import { Between, Repository } from 'typeorm';
import { toUserDate } from '../common/time';
import { StreaksService } from 'src/streaks/streaks.service';
import { User } from 'src/entities/user.entity';
import { DailyStatDto } from './dto/daily-stat.dto.ts';

@Injectable()
export class DailyStatsService {
  constructor(
    @InjectRepository(DailyStat) private dailyStatRepo: Repository<DailyStat>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly streaks: StreaksService,
  ) {}

  async getDailyStat(userId: string, date?: string): Promise<DailyStatDto> {
    let queryDate = date;

    if (!queryDate) {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['time_zone'],
      });
      const tz = user?.time_zone ?? 'UTC';
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

    const statsMap = new Map(existingStats.map((s) => [s.date, s]));
    const results: DailyStat[] = [];

    for (
      let d = new Date(from);
      d <= new Date(to);
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split('T')[0];
      results.push(
        statsMap.get(dateStr) ??
          ({
            date: dateStr,
            total_focus_minutes: 0,
            session_count: 0,
          } as DailyStat),
      );
    }

    return results;
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

  async applyMinutes(
    userId: string,
    sessionDate: Date,
    userTimeZone: string,
    minutes: number,
    sessionCount = 0,
  ) {
    const date = toUserDate(sessionDate, userTimeZone);

    let stat = await this.dailyStatRepo.findOne({
      where: { user: { id: userId }, date },
    });

    if (!stat) {
      stat = this.dailyStatRepo.create({
        user: { id: userId },
        date,
        total_focus_minutes: 0,
        session_count: 0,
      });
    }

    stat.total_focus_minutes += minutes;
    stat.session_count += sessionCount;

    return this.dailyStatRepo.save(stat);
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
}
