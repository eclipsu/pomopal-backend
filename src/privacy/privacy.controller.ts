/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PrivacyService } from './privacy.service';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { sub: string };
}

@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  /**
   * GET /privacy
   * Get my current privacy settings
   */
  @Get()
  async getPrivacy(@Req() req: AuthRequest) {
    return this.privacyService.getPrivacy(req.user.sub);
  }

  /**
   * PATCH /privacy
   * Update privacy settings (partial)
   */
  @Patch()
  async updatePrivacy(@Req() req: AuthRequest, @Body() dto: UpdatePrivacyDto) {
    return this.privacyService.updatePrivacy(req.user.sub, dto);
  }
}
