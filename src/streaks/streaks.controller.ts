/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { StreaksService } from './streaks.service';
import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('streaks')
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get()
  get(@Req() req: any) {
    return this.streaksService.get(req.user.sub);
  }
}
