import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { LeaderboardService } from './leaderboard.service';
import type { LeaderboardPeriod } from './leaderboard.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { sub: string };
}

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * GET /leaderboard?period=week
   * Friend leaderboard (auth required).
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getLeaderboard(
    @Req() req: AuthRequest,
    @Query('period') period: LeaderboardPeriod = 'week',
  ) {
    const cleanPeriod = (period?.trim() as LeaderboardPeriod) ?? 'week';
    return this.leaderboardService.getFriendLeaderboard(
      req.user.sub,
      cleanPeriod,
    );
  }

  /** GET /leaderboard/global/week — public top 5, last 7 days */
  @Get('global/week')
  async getGlobalWeek() {
    return this.leaderboardService.getGlobalWeekLeaderboard();
  }

  /** GET /leaderboard/global/alltime — public top 5 all-time */
  @Get('global/alltime')
  async getGlobalAllTime() {
    return this.leaderboardService.getGlobalAllTimeLeaderboard();
  }
}
