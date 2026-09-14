import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOB_POMODORO_COMPLETED, QUEUE_EVENTS } from '../queue/queue.constants';
import type { PomodoroCompletedJob } from './notification-jobs.types';
import { NotificationsService } from './notifications.service';

@Processor(QUEUE_EVENTS)
export class NotificationEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationEventsProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<PomodoroCompletedJob>): Promise<void> {
    if (job.name !== JOB_POMODORO_COMPLETED) return;
    try {
      await this.notifications.handlePomodoroCompleted(job.data);
    } catch (err) {
      this.logger.error(
        `pomodoro-completed failed ${job.data.sessionId}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
