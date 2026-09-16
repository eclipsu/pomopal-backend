import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationScheduleRunner } from './notification-schedule.runner';

/**
 * Nest cron drives the hourly retention scan.
 * BullMQ upsertJobScheduler previously registered scan-hour but stopped
 * advancing (next run stuck in the past) — zero real notifs for days.
 */
@Injectable()
export class NotificationScanCron {
  private readonly logger = new Logger(NotificationScanCron.name);

  constructor(private readonly runner: NotificationScheduleRunner) {}

  @Cron('0 * * * *')
  async handleHourlyScan(): Promise<void> {
    if (process.env.NOTIFICATION_WORKERS_ENABLED === 'false') {
      this.logger.warn('scan-hour skipped (NOTIFICATION_WORKERS_ENABLED=false)');
      return;
    }
    try {
      const result = await this.runner.scanHour();
      this.logger.log(
        `Nest cron scan-hour finished users=${result.users} withChecks=${result.enqueued}`,
      );
    } catch (err) {
      this.logger.error(
        `Nest cron scan-hour failed: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
