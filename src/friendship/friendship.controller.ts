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
  user: { sub: string };
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
    await this.friendshipService.sendInvite(req.user.sub, dto);
  }

  @Post('accept')
  async acceptInvite(
    @Req() req: AuthRequest,
    @Body() dto: AcceptFriendInviteDto,
  ) {
    return this.friendshipService.acceptInvite(dto.token, req.user.sub);
  }

  /**
   * GET /friends
   * List all accepted friends with presence + stats
   */
  @Get()
  async listFriends(@Req() req: AuthRequest) {
    return this.friendshipService.listFriends(req.user.sub);
  }

  /**
   * GET /friends/requests/received
   * Pending requests sent to me
   */
  @Get('requests/received')
  async pendingReceived(@Req() req: AuthRequest) {
    return this.friendshipService.listPendingReceived(req.user.sub);
  }

  /**
   * GET /friends/requests/sent
   * Pending requests I sent
   */
  @Get('requests/sent')
  async pendingSent(@Req() req: AuthRequest) {
    return this.friendshipService.listPendingSent(req.user.sub);
  }

  /**
   * POST /friends/requests/:id/accept
   * Accept a pending request (addressee must be logged in)
   */
  @Post('requests/:id/accept')
  async acceptPending(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) friendshipId: string,
  ) {
    return this.friendshipService.acceptPendingRequest(
      req.user.sub,
      friendshipId,
    );
  }

  /**
   * DELETE /friends/requests/:id
   * Cancel or decline a pending request
   */
  @Delete('requests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelPending(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) friendshipId: string,
  ): Promise<void> {
    await this.friendshipService.cancelPending(req.user.sub, friendshipId);
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
    return this.friendshipService.getFriendProfile(req.user.sub, friendId);
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
    await this.friendshipService.unfriend(req.user.sub, friendId);
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
    await this.friendshipService.block(req.user.sub, targetId);
  }
}
