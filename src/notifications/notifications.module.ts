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
import { NotificationScheduler } from './notification-scheduler';
import { TemplatePickerService } from './template-picker.service';
import { StreaksModule } from '../streaks/streaks.module';

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
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationScheduler,
    TemplatePickerService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
