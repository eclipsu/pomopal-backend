import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

interface AuthRequest extends Request {
  user: { sub: string };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.notifications.listForUser(req.user.sub);
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthRequest) {
    return this.notifications.unreadCount(req.user.sub).then((count) => ({
      count,
    }));
  }

  @Get('preferences')
  getPreferences(@Req() req: AuthRequest) {
    return this.notifications.getPreferences(req.user.sub);
  }

  @Patch('preferences')
  updatePreferences(
    @Req() req: AuthRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(req.user.sub, dto);
  }

  @Patch('read-all')
  markAllRead(@Req() req: AuthRequest) {
    return this.notifications.markAllRead(req.user.sub);
  }

  @Patch(':id/read')
  markRead(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(req.user.sub, id);
  }
}
