import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { AdminService } from './admin.service';
import { TestSendNotificationDto } from './dto/test-send.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.admin.listUsers(q, limit ? Number(limit) : 50);
  }

  @Post('test-send')
  testSend(@Body() dto: TestSendNotificationDto) {
    return this.admin.testSend(dto);
  }
}
