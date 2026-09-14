import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import {
  JOB_EVALUATE_USER,
  JOB_SCAN_HOUR,
  QUEUE_SCHEDULE,
} from '../queue/queue.constants';
import type { EvaluateUserJob } from './notification-jobs.types';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationScheduleRunner } from './notification-schedule.runner';
import {
  localHourInTz,
  localWeekdayInTz,
  normalizeTimezone,
  todayInTz,
} from '../common/time';

const STREAK_NUDGE_HOURS = new Set([21, 23]);
const COMEBACK_HOUR = 10;
const STREAK_UPDATE_HOUR = 10;
const WEEKLY_RANK_HOUR = 10;
const SUNDAY = 0;
const MONDAY = 1;

@Processor(QUEUE_SCHEDULE)
@Injectable()
export class NotificationScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationScheduleProcessor.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly queue: NotificationQueueService,
    private readonly runner: NotificationScheduleRunner,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_SCAN_HOUR) {
      await this.scanHour();
      return;
    }
    if (job.name === JOB_EVALUATE_USER) {
      await this.runner.evaluateUser(job.data as EvaluateUserJob);
    }
  }

  private async scanHour(): Promise<void> {
    const users = await this.userRepo.find({
      select: ['id', 'email', 'time_zone'],
    });
    this.logger.log(`scan-hour: enqueue for up to ${users.length} users`);

    for (const user of users) {
      const tz = normalizeTimezone(user.time_zone);
      const hour = localHourInTz(tz);
      const today = todayInTz(tz);
      const weekday = localWeekdayInTz(tz);
      const checks: EvaluateUserJob['checks'] = [];

      if (STREAK_NUDGE_HOURS.has(hour)) {
        checks.push('streak_at_risk');
      }
      if (hour === COMEBACK_HOUR) {
        checks.push('comeback');
      }
      if (hour === STREAK_UPDATE_HOUR && weekday === SUNDAY) {
        checks.push('streak_update');
      }
      if (hour === WEEKLY_RANK_HOUR && weekday === MONDAY) {
        checks.push('weekly_rank');
      }

      const preferred = await this.runner.preferredFocusHour(user.id, tz);
      if (hour === (preferred ?? 17)) {
        checks.push('daily_nudge');
      }

      if (checks.length === 0) continue;

      try {
        await this.queue.enqueueEvaluateUser({
          v: 1,
          userId: user.id,
          email: user.email,
          tz,
          today,
          hour,
          checks,
        });
      } catch (err) {
        this.logger.warn(
          `enqueue evaluate failed ${user.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
