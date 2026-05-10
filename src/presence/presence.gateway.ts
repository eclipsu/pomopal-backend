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
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import { PresenceStatus } from './dto/update-presence.dto';

interface AuthSocket extends Socket {
  userId: string;
}

interface PresenceBroadcast {
  userId: string;
  status: PresenceStatus;
  custom_status: string | null;
  current_activity: string | null;
}

@WebSocketGateway({
  namespace: '/presence',
  cors: { origin: process.env.APP_URL, credentials: true },
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
  ) {}

  // ─── Connection lifecycle ────────────────────────────────────────────────────

  async handleConnection(client: AuthSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = this.jwtService.verify<{ sub: string }>(token);
      client.userId = payload.sub;
    } catch {
      client.disconnect();
      return;
    }

    const { userId } = client;
    this.logger.log(`User ${userId} connected (socket ${client.id})`);

    // Track socket
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    // Each user joins their own room — friends subscribe to this room from client
    await client.join(`user:${userId}`);

    // Mark online
    await this.presenceService.handleConnect(userId);

    // Broadcast to anyone subscribed to this user's room
    this.server.to(`user:${userId}`).emit('presence:changed', {
      userId,
      status: 'online',
      custom_status: null,
      current_activity: null,
    } satisfies PresenceBroadcast);
  }

  async handleDisconnect(client: AuthSocket): Promise<void> {
    const { userId } = client;
    if (!userId) return;

    this.logger.log(`User ${userId} disconnected (socket ${client.id})`);

    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);

    // Only go offline if ALL tabs closed
    if (!sockets || sockets.size === 0) {
      this.userSockets.delete(userId);
      await this.presenceService.handleDisconnect(userId);

      this.server.to(`user:${userId}`).emit('presence:changed', {
        userId,
        status: 'offline',
        custom_status: null,
        current_activity: null,
      } satisfies PresenceBroadcast);
    }
  }

  // ─── Client events ───────────────────────────────────────────────────────────

  /**
   * Client sends every 30s to stay online.
   */
  @SubscribeMessage('presence:heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: AuthSocket): Promise<void> {
    await this.presenceService.heartbeat(client.userId);
  }

  /**
   * Client subscribes to a friend's presence room.
   * Frontend calls this after fetching the friend list.
   * Payload: { friendId: string }
   */
  @SubscribeMessage('presence:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { friendId: string },
  ): Promise<void> {
    await client.join(`user:${data.friendId}`);

    // Send current presence snapshot for this friend immediately
    const presence = await this.presenceService.getPresence(data.friendId);
    if (presence) {
      client.emit('presence:changed', {
        userId: data.friendId,
        status: presence.status,
        custom_status: presence.custom_status,
        current_activity: presence.current_activity,
      } satisfies PresenceBroadcast);
    }
  }

  /**
   * Client unsubscribes from a friend's presence room (e.g. after unfriend).
   * Payload: { friendId: string }
   */
  @SubscribeMessage('presence:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { friendId: string },
  ): Promise<void> {
    await client.leave(`user:${data.friendId}`);
  }

  /**
   * Client updates custom status or activity manually.
   */
  @SubscribeMessage('presence:update')
  async handlePresenceUpdate(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() dto: UpdatePresenceDto,
  ): Promise<void> {
    const updated = await this.presenceService.updatePresence(
      client.userId,
      dto,
    );

    const broadcast: PresenceBroadcast = {
      userId: client.userId,
      status: updated.status,
      custom_status: updated.custom_status,
      current_activity: updated.current_activity,
    };

    client.emit('presence:updated', broadcast);
    this.server.to(`user:${client.userId}`).emit('presence:changed', broadcast);
  }

  // ─── Called externally (e.g. PomodoroService) ────────────────────────────────

  broadcastActivityUpdate(userId: string, activity: string | null): void {
    this.server.to(`user:${userId}`).emit('presence:activity', {
      userId,
      current_activity: activity,
    });
  }

  // ─── Token extraction ─────────────────────────────────────────────────────────

  private extractToken(client: Socket): string {
    const fromQuery = client.handshake.query?.token as string;
    if (fromQuery) return fromQuery;

    const authHeader = client.handshake.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

    throw new WsException('No auth token provided.');
  }
}
