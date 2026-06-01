/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Friendship } from '../entities/friendship.entity';
import { PresenceService, PresenceData } from './presence.service';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import { PresenceStatus } from './dto/update-presence.dto';
import { getCorsOriginConfig } from '../config/cors.config';

interface AuthSocket extends Socket {
  userId: string;
}

interface PresenceBroadcast {
  userId: string;
  status: PresenceStatus;
  custom_status: string | null;
  last_seen_at: string | null;
}

@WebSocketGateway({
  namespace: '/presence',
  cors: {
    origin: getCorsOriginConfig(),
    credentials: true,
  },
})
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PresenceGateway.name);

  // userId → Set of socket IDs (multiple tabs)
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly presenceService: PresenceService,
    private readonly jwtService: JwtService,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
  ) {}

  getConnectedUserIds(): string[] {
    return [...this.userSockets.keys()];
  }

  // ─── Connection lifecycle ────────────────────────────────────────────────────

  async handleConnection(client: AuthSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = this.jwtService.verify<{ sub: string }>(token);
      client.userId = payload.sub;
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'invalid or missing token';
      this.logger.warn(
        `Connection rejected (socket ${client.id}): ${reason}`,
      );
      client.disconnect();
      return;
    }

    const { userId } = client;
    this.logger.log(`User ${userId} connected (socket ${client.id})`);

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    await client.join(`user:${userId}`);

    await this.presenceService.handleConnect(userId);
    await this.broadcastPresence(userId);
  }

  async handleDisconnect(client: AuthSocket): Promise<void> {
    const { userId } = client;
    if (!userId) return;

    this.logger.log(`User ${userId} disconnected (socket ${client.id})`);

    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);

    if (!sockets || sockets.size === 0) {
      this.userSockets.delete(userId);
      await this.presenceService.handleDisconnect(userId);
      await this.broadcastPresence(userId);
    }
  }

  // ─── Client events ───────────────────────────────────────────────────────────

  /** Window open/focus, tab visible, session start/end — not periodic heartbeat. */
  @SubscribeMessage('presence:active')
  async handleActive(@ConnectedSocket() client: AuthSocket): Promise<void> {
    await this.presenceService.touchActive(client.userId);
    await this.broadcastPresence(client.userId);
  }

  @SubscribeMessage('presence:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { friendId: string },
  ): Promise<void> {
    const allowed = await this.canViewPresence(client.userId, data.friendId);
    if (!allowed) {
      throw new WsException('Not allowed to view this user’s presence.');
    }

    await client.join(`user:${data.friendId}`);

    const presence = await this.presenceService.getPresence(data.friendId);
    client.emit('presence:changed', this.toBroadcast(data.friendId, presence));
  }

  @SubscribeMessage('presence:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { friendId: string },
  ): Promise<void> {
    await client.leave(`user:${data.friendId}`);
  }

  @SubscribeMessage('presence:update')
  async handlePresenceUpdate(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() dto: UpdatePresenceDto,
  ): Promise<void> {
    const updated = await this.presenceService.updatePresence(
      client.userId,
      dto,
    );

    const broadcast = this.toBroadcast(client.userId, updated);
    client.emit('presence:updated', broadcast);
    this.server.to(`user:${client.userId}`).emit('presence:changed', broadcast);
  }

  broadcastPresenceChanged(userId: string, status: PresenceStatus): void {
    void this.presenceService.getPresence(userId).then((presence) => {
      this.server
        .to(`user:${userId}`)
        .emit('presence:changed', this.toBroadcast(userId, { ...presence, status }));
    });
  }

  private async broadcastPresence(userId: string): Promise<void> {
    const presence = await this.presenceService.getPresence(userId);
    this.server
      .to(`user:${userId}`)
      .emit('presence:changed', this.toBroadcast(userId, presence));
  }

  private toBroadcast(userId: string, presence: PresenceData): PresenceBroadcast {
    return {
      userId,
      status: presence.status,
      custom_status: presence.custom_status,
      last_seen_at: presence.last_seen_at,
    };
  }

  private async canViewPresence(
    viewerId: string,
    targetId: string,
  ): Promise<boolean> {
    if (viewerId === targetId) return true;

    const friendship = await this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoin('f.requester', 'requester')
      .leftJoin('f.addressee', 'addressee')
      .where('f.status = :status', { status: 'accepted' })
      .andWhere(
        '(requester.id = :viewer AND addressee.id = :target) OR (requester.id = :target AND addressee.id = :viewer)',
        { viewer: viewerId, target: targetId },
      )
      .getOne();

    return !!friendship;
  }

  private extractToken(client: Socket): string {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;

    const cookies = client.handshake.headers.cookie ?? '';
    const match = cookies
      .split('; ')
      .find((r) => r.startsWith('access_token='));
    if (match) return match.split('=')[1];

    const fromQuery = client.handshake.query?.token as string;
    if (fromQuery) return fromQuery;

    const authHeader = client.handshake.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

    throw new WsException('No auth token provided.');
  }
}
