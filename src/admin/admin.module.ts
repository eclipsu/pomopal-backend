import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { User } from '../entities/user.entity';
import { AdminNotificationTemplatesController } from './admin-notification-templates.controller';
import { AdminNotificationTemplatesService } from './admin-notification-templates.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { UserModule } from '../user/user.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationTemplate, User]),
    UserModule,
    NotificationsModule,
  ],
  controllers: [AdminNotificationTemplatesController, AdminController],
  providers: [AdminNotificationTemplatesService, AdminService, AdminGuard],
})
export class AdminModule {}
