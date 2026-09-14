import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { LeaderboardService } from './leaderboard.service';
import type { LeaderboardPeriod } from './leaderboard.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt/optional-jwt-auth.guard';

interface AuthRequest extends Request {
  user: { sub: string };
}

interface OptionalAuthRequest extends Request {
  user?: { sub: string };
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

  /** GET /leaderboard/global/week — public top 5; appends you when logged in */
  @Get('global/week')
  @UseGuards(OptionalJwtAuthGuard)
  async getGlobalWeek(@Req() req: OptionalAuthRequest) {
    return this.leaderboardService.getGlobalWeekLeaderboard(req.user?.sub);
  }

  /** GET /leaderboard/global/alltime — public top 5; appends you when logged in */
  @Get('global/alltime')
  @UseGuards(OptionalJwtAuthGuard)
  async getGlobalAllTime(@Req() req: OptionalAuthRequest) {
    return this.leaderboardService.getGlobalAllTimeLeaderboard(req.user?.sub);
  }
}
