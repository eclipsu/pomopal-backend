/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DailyStat } from 'src/entities/daily-stat.entity';
import { Session } from 'src/entities/sessions.entity';
import { Between, Repository } from 'typeorm';
import { toUserDate } from '../common/time';
import { StreaksService } from 'src/streaks/streaks.service';

@Injectable()
export class DailyStatsService {
  constructor(
    @InjectRepository(DailyStat) private dailyStatRepo: Repository<DailyStat>,
    private readonly streaks: StreaksService,
  ) {}

  async getDailyStat(userId: string, date: string): Promise<DailyStat | null> {
    return await this.dailyStatRepo.findOne({
      where: {
        user: { id: userId },
        date: date,
      },
    });
  }

  async getRange(userId: string, from: string, to: string) {
    return this.dailyStatRepo.find({
      where: {
        user: { id: userId },
        date: Between(from, to),
      },
      order: { date: 'ASC' },
    });
  }

  async applySession(session: Session, userTimeZone: string) {
    const date: string = toUserDate(session.started_at, userTimeZone);

    let stat = await this.dailyStatRepo.findOne({
      where: { user: { id: session.user.id }, date: date },
    });

    if (!stat) {
      stat = this.dailyStatRepo.create({
        user: { id: session.user.id },
        total_focus_minutes: 0,
        session_count: 0,
      });
    }

    stat.total_focus_minutes += session.actual_duration_minutes!;
    await this.streaks.update(session.user, date);
    stat.session_count += 1;
    stat.date = date;

    return this.dailyStatRepo.save(stat);
  }
}
