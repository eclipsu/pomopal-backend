import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationPreferences } from '../entities/notification-preferences.entity';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { User } from '../entities/user.entity';
import { Streak } from '../entities/streak.entity';
import { Session } from '../entities/sessions.entity';
import { DailyStat } from '../entities/daily-stat.entity';
import { MailModule } from '../mail/mail.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TemplatePickerService } from './template-picker.service';
import { StreaksModule } from '../streaks/streaks.module';
import { QueueModule } from '../queue/queue.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { NotificationStatsService } from './notification-stats.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationScheduleRunner } from './notification-schedule.runner';
import { NotificationScheduleProcessor } from './notification-schedule.processor';
import { NotificationEventsProcessor } from './notification-events.processor';
import { NotificationEmailProcessor } from './notification-email.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationPreferences,
      NotificationTemplate,
      User,
      Streak,
      Session,
      DailyStat,
    ]),
    MailModule,
    StreaksModule,
    QueueModule,
    LeaderboardModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    TemplatePickerService,
    NotificationStatsService,
    NotificationQueueService,
    NotificationScheduleRunner,
    NotificationScheduleProcessor,
    NotificationEventsProcessor,
    NotificationEmailProcessor,
  ],
  exports: [NotificationsService, TemplatePickerService, NotificationStatsService],
})
export class NotificationsModule {}
