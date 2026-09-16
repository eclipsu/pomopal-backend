import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  JOB_EVALUATE_USER,
  JOB_SCAN_HOUR,
  QUEUE_SCHEDULE,
} from '../queue/queue.constants';
import type { EvaluateUserJob } from './notification-jobs.types';
import { NotificationScheduleRunner } from './notification-schedule.runner';

/** Still accepts queue jobs (manual / legacy). Primary trigger is Nest cron. */
@Processor(QUEUE_SCHEDULE)
@Injectable()
export class NotificationScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationScheduleProcessor.name);

  constructor(private readonly runner: NotificationScheduleRunner) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_SCAN_HOUR) {
      this.logger.log('scan-hour job received via queue');
      await this.runner.scanHour();
      return;
    }
    if (job.name === JOB_EVALUATE_USER) {
      await this.runner.evaluateUser(job.data as EvaluateUserJob);
    }
  }
}
