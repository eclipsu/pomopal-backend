import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { NotificationTemplateImage } from '../entities/notification-template-image.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationPreferences } from '../entities/notification-preferences.entity';
import { User } from '../entities/user.entity';
import { AdminNotificationTemplatesController } from './admin-notification-templates.controller';
import { AdminNotificationTemplatesService } from './admin-notification-templates.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { UserModule } from '../user/user.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreaksModule } from '../streaks/streaks.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationTemplate,
      NotificationTemplateImage,
      Notification,
      NotificationPreferences,
      User,
    ]),
    UserModule,
    NotificationsModule,
    StreaksModule,
    StorageModule,
  ],
  controllers: [AdminNotificationTemplatesController, AdminController],
  providers: [AdminNotificationTemplatesService, AdminService, AdminGuard],
})
export class AdminModule {}
