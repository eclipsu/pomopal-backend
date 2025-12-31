/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { DailyStatsService } from './daily-stats.service';
import { Controller, Query } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { GetDailyStatDto } from './dto/get-daily-stats.dto';
import { CalendarRangeDto } from './dto/calendar-range.dto';
import { Req } from '@nestjs/common';
import { Get } from '@nestjs/common';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class DailyStatsController {
  constructor(private readonly dailyStatsService: DailyStatsService) {}

  @Get('/daily')
  getDay(@Req() req: any, @Query() query: GetDailyStatDto) {
    return this.dailyStatsService.getDailyStat(req.user.id, query.date);
  }

  @Get('/calendar')
  getRange(@Req() req: any, @Query() dto: CalendarRangeDto) {
    return this.dailyStatsService.getRange(req.user.id, dto.from, dto.to);
  }
}
