import { Controller, Patch, Get, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PresenceService } from './presence.service';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: string };
}

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  /**
   * GET /presence/me
   * Get my current presence data
   */
  @Get('me')
  async getMyPresence(@Req() req: AuthRequest) {
    return this.presenceService.getPresence(req.user.id);
  }

  /**
   * PATCH /presence
   * Update custom status or current activity
   * (WebSocket is preferred — this is a REST fallback)
   */
  @Patch()
  async updatePresence(
    @Req() req: AuthRequest,
    @Body() dto: UpdatePresenceDto,
  ) {
    return this.presenceService.updatePresence(req.user.id, dto);
  }
}
