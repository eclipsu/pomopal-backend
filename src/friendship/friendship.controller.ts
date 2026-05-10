import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { FriendshipService } from './friendship.service';
import { SendFriendInviteDto } from './dto/send-friend-invite.dto';
import { AcceptFriendInviteDto } from './dto/accept-friendship.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: string };
}

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendshipController {
  constructor(private readonly friendshipService: FriendshipService) {}

  @Post('invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendInvite(
    @Req() req: AuthRequest,
    @Body() dto: SendFriendInviteDto,
  ): Promise<void> {
    await this.friendshipService.sendInvite(req.user.id, dto);
  }

  @Post('accept')
  async acceptInvite(
    @Req() req: AuthRequest,
    @Body() dto: AcceptFriendInviteDto,
  ) {
    return this.friendshipService.acceptInvite(dto.token, req.user.id);
  }

  /**
   * GET /friends
   * List all accepted friends with presence + stats
   */
  @Get()
  async listFriends(@Req() req: AuthRequest) {
    return this.friendshipService.listFriends(req.user.id);
  }

  /**
   * GET /friends/requests/received
   * Pending requests sent to me
   */
  @Get('requests/received')
  async pendingReceived(@Req() req: AuthRequest) {
    return this.friendshipService.listPendingReceived(req.user.id);
  }

  /**
   * GET /friends/requests/sent
   * Pending requests I sent
   */
  @Get('requests/sent')
  async pendingSent(@Req() req: AuthRequest) {
    return this.friendshipService.listPendingSent(req.user.id);
  }

  /**
   * GET /friends/:id
   * View a specific friend's profile
   */
  @Get(':id')
  async getFriendProfile(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) friendId: string,
  ) {
    return this.friendshipService.getFriendProfile(req.user.id, friendId);
  }

  /**
   * DELETE /friends/:id
   * Unfriend
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfriend(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) friendId: string,
  ): Promise<void> {
    await this.friendshipService.unfriend(req.user.id, friendId);
  }

  /**
   * POST /friends/:id/block
   * Block a user
   */
  @Post(':id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) targetId: string,
  ): Promise<void> {
    await this.friendshipService.block(req.user.id, targetId);
  }
}
