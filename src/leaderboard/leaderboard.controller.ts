import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { LeaderboardService } from './leaderboard.service';
import type { LeaderboardPeriod } from './leaderboard.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { sub: string };
}

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * GET /leaderboard?period=week
   * Get friend leaderboard for a given period
   * period: today | week | alltime (default: week)
   */
  @Get()
  async getLeaderboard(
    @Req() req: AuthRequest,
    @Query('period') period: LeaderboardPeriod = 'week',
  ) {
    return this.leaderboardService.getFriendLeaderboard(req.user.sub, period);
  }
}
