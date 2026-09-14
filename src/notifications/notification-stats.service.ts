import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { DailyStat } from '../entities/daily-stat.entity';
import { User } from '../entities/user.entity';
import { Session, SessionType } from '../entities/sessions.entity';
import { addDaysYmd } from '../mail/streak-update-email';

@Injectable()
export class NotificationStatsService {
  constructor(
    @InjectRepository(DailyStat)
    private readonly dailyStatRepo: Repository<DailyStat>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
  ) {}

  async todayMinutes(userId: string, todayYmd: string): Promise<number> {
    const row = await this.dailyStatRepo.findOne({
      where: { user: { id: userId }, date: todayYmd },
      select: ['total_focus_minutes'],
    });
    return row?.total_focus_minutes ?? 0;
  }

  async todaySessionCount(userId: string, todayYmd: string): Promise<number> {
    const row = await this.dailyStatRepo.findOne({
      where: { user: { id: userId }, date: todayYmd },
      select: ['session_count'],
    });
    return row?.session_count ?? 0;
  }

  async allTimeMinutes(userId: string): Promise<number> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['all_time_focus_minutes'],
    });
    return user?.all_time_focus_minutes ?? 0;
  }

  /** Inclusive week window ending on `endYmd` (7 days). */
  async weekMinutes(userId: string, endYmd: string): Promise<number> {
    const from = addDaysYmd(endYmd, -6);
    const rows = await this.dailyStatRepo.find({
      where: {
        user: { id: userId },
        date: Between(from, endYmd),
      },
      select: ['total_focus_minutes'],
    });
    return rows.reduce((sum, r) => sum + (r.total_focus_minutes ?? 0), 0);
  }

  async weekSessionCount(userId: string, endYmd: string): Promise<number> {
    const from = addDaysYmd(endYmd, -6);
    const rows = await this.dailyStatRepo.find({
      where: {
        user: { id: userId },
        date: Between(from, endYmd),
      },
      select: ['session_count'],
    });
    return rows.reduce((sum, r) => sum + (r.session_count ?? 0), 0);
  }

  async completedPomodoroCount(userId: string): Promise<number> {
    return this.sessionRepo.count({
      where: {
        user: { id: userId },
        completed: true,
        type: SessionType.POMODORO,
      },
    });
  }
}
