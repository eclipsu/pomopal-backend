import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { AdminService } from './admin.service';
import { TestSendNotificationDto } from './dto/test-send.dto';
import { ReviveStreakDto } from './dto/revive-streak.dto';
import { BroadcastAnnouncementDto } from './dto/announcement.dto';
import { PreviewNotificationDto } from './dto/preview-notification.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.admin.listUsers(q, limit ? Number(limit) : 50);
  }

  @Get('users/:id/streak-status')
  getUserStreakStatus(@Param('id') id: string) {
    return this.admin.getUserStreakStatus(id);
  }

  @Post('test-send')
  testSend(@Body() dto: TestSendNotificationDto) {
    return this.admin.testSend(dto);
  }

  @Post('revive-streak')
  reviveStreak(@Body() dto: ReviveStreakDto) {
    return this.admin.reviveStreak(dto);
  }

  @Post('announcement')
  broadcastAnnouncement(@Body() dto: BroadcastAnnouncementDto) {
    return this.admin.broadcastAnnouncement(dto);
  }

  @Post('preview-notification')
  previewNotification(@Body() dto: PreviewNotificationDto) {
    return this.admin.previewNotification(dto);
  }
}
