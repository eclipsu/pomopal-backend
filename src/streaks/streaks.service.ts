import { Injectable, BadRequestException } from '@nestjs/common';
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
  daysBetweenYmd,
} from 'src/common/time';
import { MailService } from '../mail/mail.service';
import { STREAK_GRACE_DAYS } from './streak.constants';

export type StreakReviveStatus = 'none' | 'active' | 'at_risk' | 'broken';

export interface StreakReviveEligibility {
  status: StreakReviveStatus;
  eligible: boolean;
  reason: string;
  current_streak: number;
  displayed_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  grace_days_remaining?: number;
}

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

    const lastActive = streakDateToYmd(
      streak.last_active_date,
      normalizeTimezone(user.time_zone),
    );
    if (!lastActive || lastActive === date) return streak;

    const gap = daysBetweenYmd(lastActive, date);
    if (gap <= 0) return streak;

    // Within grace: continue streak. Beyond grace: reset.
    if (gap <= STREAK_GRACE_DAYS) streak.current_streak += 1;
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

    if (!streak || !streak.last_active_date)
      return {
        current_streak: 0,
        longest_streak: 0,
        last_active_date: null,
        grace_days_remaining: 0,
      };

    const tz = normalizeTimezone(streak.user?.time_zone);
    const today = todayInTz(tz);
    const lastActiveDate = streakDateToYmd(streak.last_active_date, tz);
    if (!lastActiveDate) {
      return {
        current_streak: 0,
        longest_streak: streak.longest_streak,
        last_active_date: null,
        grace_days_remaining: 0,
      };
    }

    const gap = daysBetweenYmd(lastActiveDate, today);
    if (gap >= 0 && gap <= STREAK_GRACE_DAYS) {
      return {
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
        last_active_date: lastActiveDate,
        grace_days_remaining: STREAK_GRACE_DAYS - gap,
      };
    }

    return {
      current_streak: 0,
      longest_streak: streak.longest_streak,
      last_active_date: lastActiveDate,
      grace_days_remaining: 0,
    };
  }

  async getReviveEligibility(userId: string): Promise<StreakReviveEligibility> {
    const streak = await this.streakRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!streak || !streak.last_active_date) {
      return {
        status: 'none',
        eligible: false,
        reason: 'No streak record for this user',
        current_streak: 0,
        displayed_streak: 0,
        longest_streak: streak?.longest_streak ?? 0,
        last_active_date: null,
        grace_days_remaining: 0,
      };
    }

    const tz = normalizeTimezone(streak.user?.time_zone);
    const today = todayInTz(tz);
    const lastActive = streakDateToYmd(streak.last_active_date, tz);

    const base = {
      current_streak: streak.current_streak,
      longest_streak: streak.longest_streak,
      last_active_date: lastActive,
    };

    if (!lastActive) {
      return {
        ...base,
        status: 'broken',
        eligible: false,
        reason: 'Invalid last active date',
        displayed_streak: 0,
        grace_days_remaining: 0,
      };
    }

    const gap = daysBetweenYmd(lastActive, today);

    if (gap === 0) {
      return {
        ...base,
        status: 'active',
        eligible: false,
        reason: 'Streak is active — user focused today',
        displayed_streak: streak.current_streak,
        grace_days_remaining: STREAK_GRACE_DAYS,
      };
    }

    if (gap >= 1 && gap <= STREAK_GRACE_DAYS) {
      const remaining = STREAK_GRACE_DAYS - gap;
      return {
        ...base,
        status: 'at_risk',
        eligible: false,
        reason:
          remaining === 0
            ? `Streak is at risk — last day of the ${STREAK_GRACE_DAYS}-day grace period`
            : `Streak is at risk — ${remaining} grace day${remaining === 1 ? '' : 's'} left`,
        displayed_streak: streak.current_streak,
        grace_days_remaining: remaining,
      };
    }

    if (streak.current_streak === 0) {
      return {
        ...base,
        status: 'broken',
        eligible: false,
        reason: 'No streak count to restore',
        displayed_streak: 0,
        grace_days_remaining: 0,
      };
    }

    return {
      ...base,
      status: 'broken',
      eligible: true,
      reason: 'Eligible — streak is broken and can be revived',
      displayed_streak: 0,
      grace_days_remaining: 0,
    };
  }

  async reviveStreak(userId: string): Promise<{
    restored: boolean;
    current_streak: number;
  }> {
    const eligibility = await this.getReviveEligibility(userId);
    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason);
    }

    const streak = await this.streakRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!streak) throw new BadRequestException('No streak found');

    const tz = normalizeTimezone(streak.user?.time_zone);
    // Put user back into at-risk (1 day into grace) so they must focus soon.
    const yesterday = yesterdayInTz(tz);
    streak.last_active_date = yesterday;
    await this.streakRepo.save(streak);

    return { restored: true, current_streak: streak.current_streak };
  }

  async restoreStreak(email: string): Promise<{ restored: boolean; current_streak: number }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BadRequestException('User not found');

    const result = await this.reviveStreak(user.id);

    if (this.mailService.isConfigured()) {
      await this.mailService
        .sendAnnouncement({
          to: email,
          title: 'Streak restored',
          body: `Life happens, we understand that you can not always be productive. We restored your ${result.current_streak}-day streak. We will be introducing streak restores rewards in future. Thank you so much for using Pomopal and we hope to see your streak go up again.`,
          imageUrl: IMAGES.super,
        })
        .catch(() => null);
    }

    return result;
  }
}
