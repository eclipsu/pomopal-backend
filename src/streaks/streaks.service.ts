import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Streak } from 'src/entities/streak.entity';
import { User } from 'src/entities/user.entity';
import { IMAGES } from '../notifications/notifications.service';
import {
  todayInTz,
  yesterdayInTz,
  normalizeTimezone,
  streakDateToYmd,
} from 'src/common/time';
import { BadRequestException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

@Injectable()
export class StreaksService {
  constructor(
    @InjectRepository(Streak) private streakRepo: Repository<Streak>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  async getRecord(userId: string): Promise<Streak | null> {
    return this.streakRepo.findOne({
      where: { user: { id: userId } },
    });
  }

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

    const tz = normalizeTimezone(streak.user?.time_zone);
    const today = todayInTz(tz);
    const yesterday = yesterdayInTz(tz);

    const lastActiveDate = streakDateToYmd(streak.last_active_date, tz);
    if (!lastActiveDate) {
      return { current_streak: 0, longest_streak: streak.longest_streak };
    }

    if (lastActiveDate === today || lastActiveDate === yesterday)
      return {
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
      };

    return { current_streak: 0, longest_streak: streak.longest_streak };
  }

  async restoreStreak(email: string): Promise<{ restored: boolean; current_streak: number }> {
    console.log('email', email);
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
  
    const streak = await this.streakRepo.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });
    if (!streak) throw new BadRequestException('No streak found');
  
    const tz = normalizeTimezone(user.time_zone);
    const today = todayInTz(tz);
    const yesterday = yesterdayInTz(tz);
    const lastActive = streakDateToYmd(streak.last_active_date, tz);
  
    if (lastActive === today || lastActive === yesterday) {
      throw new BadRequestException('Streak is still active, nothing to restore');
    }
  
    if (streak.current_streak === 0) {
      throw new BadRequestException('No streak to restore');
    }
  
    streak.last_active_date = yesterday;
    await this.streakRepo.save(streak);
  
    if (this.mailService.isConfigured()) {
      await this.mailService.sendAnnouncement({
        to: email,
        title: 'Streak restored',
        body: `Life happens, we understand that you can not always be productive. We restored your ${streak.current_streak}-day streak. 
        We will be introducing streak restores rewards in future. Thank you so much for using Pomopal and we hope to see your streak go up again. 
        `,
        imageUrl: IMAGES.super,
      }).catch(() => null);
    }
  
    return { restored: true, current_streak: streak.current_streak };
  }

  private shiftDate(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
