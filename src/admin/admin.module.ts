import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { StorageService } from '../storage/storage.service';
import { AdminNotificationTemplatesController } from './admin-notification-templates.controller';
import { AdminNotificationTemplatesService } from './admin-notification-templates.service';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { UserModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationTemplate]), UserModule],
  controllers: [AdminNotificationTemplatesController],
  providers: [AdminNotificationTemplatesService, StorageService, AdminGuard],
})
export class AdminModule {}
