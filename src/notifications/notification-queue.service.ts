import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  JOB_EVALUATE_USER,
  JOB_POMODORO_COMPLETED,
  JOB_SCAN_HOUR,
  JOB_SEND_EMAIL,
  QUEUE_EMAIL,
  QUEUE_EVENTS,
  QUEUE_SCHEDULE,
} from '../queue/queue.constants';
import type {
  EvaluateUserJob,
  PomodoroCompletedJob,
  SendEmailJob,
} from './notification-jobs.types';
import { jitterMsForUser } from './notification-eligibility';

@Injectable()
export class NotificationQueueService implements OnModuleInit {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(
    @InjectQueue(QUEUE_SCHEDULE) private readonly scheduleQueue: Queue,
    @InjectQueue(QUEUE_EVENTS) private readonly eventsQueue: Queue,
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NOTIFICATION_WORKERS_ENABLED === 'false') {
      this.logger.warn('Notification workers disabled via env');
      return;
    }
    await this.scheduleQueue.upsertJobScheduler(
      'notif-scan-hour',
      { pattern: '0 * * * *' },
      {
        name: JOB_SCAN_HOUR,
        data: { v: 1 },
        opts: {
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      },
    );
    this.logger.log('Registered repeatable scan-hour job');
  }

  async enqueueEvaluateUser(job: EvaluateUserJob): Promise<void> {
    const delay = jitterMsForUser(job.userId);
    await this.scheduleQueue.add(JOB_EVALUATE_USER, job, {
      jobId: `eval:${job.userId}:${job.today}:${job.hour}`,
      delay,
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  }

  async enqueuePomodoroCompleted(job: PomodoroCompletedJob): Promise<void> {
    await this.eventsQueue.add(JOB_POMODORO_COMPLETED, job, {
      jobId: `pomo:${job.sessionId}`,
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
    });
  }

  async enqueueSendEmail(job: SendEmailJob): Promise<void> {
    await this.emailQueue.add(JOB_SEND_EMAIL, job, {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
    });
  }
}
