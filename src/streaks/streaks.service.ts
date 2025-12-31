import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Streak } from 'src/entities/streak.entity';
import { User } from 'src/entities/user.entity';
import { todayInTz, yesterdayInTz } from 'src/common/time';

@Injectable()
export class StreaksService {
  constructor(
    @InjectRepository(Streak) private streakRepo: Repository<Streak>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async update(user: User, date: string) {
    let streak = await this.streakRepo.findOne({
      where: { user: { id: user.id } },
    });

    if (!streak) {
      streak = this.streakRepo.create({
        user,
        current_streak: 1,
        longest_streak: 1,
        last_active_date: date,
      });
      return this.streakRepo.save(streak);
    }

    if (streak.last_active_date === date) return streak;
    const yesterday = this.shiftDate(date, -1);

    if (streak.last_active_date === yesterday) streak.current_streak += 1;
    else streak.current_streak = 1;

    streak.longest_streak = Math.max(
      streak.longest_streak,
      streak.current_streak,
    );
    streak.last_active_date = date;

    return this.streakRepo.save(streak);
  }

  async get(userId: string) {
    const streak = await this.streakRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    // return streak;

    if (!streak || !streak.last_active_date)
      return { current_streak: 0, longest_streak: 0 };

    const today = todayInTz(streak.user.time_zone);
    const yesterday = yesterdayInTz(streak.user.time_zone);

    if (
      streak.last_active_date === today ||
      streak.last_active_date === yesterday
    )
      return {
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
      };

    return { current_streak: 0, longest_streak: streak.longest_streak };
  }

  private shiftDate(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
