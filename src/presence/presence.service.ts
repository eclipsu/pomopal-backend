/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { UpdatePresenceDto } from './dto/update-presence.dto';

export type PresenceStatus = 'online' | 'idle' | 'offline';

export interface PresenceData {
  status: PresenceStatus;
  custom_status: string | null;
  current_activity: string | null;
  last_seen_at: string | null;
}

const HEARTBEAT_TTL = 35;
const PRESENCE_TTL = 60 * 60 * 24;

const keys = {
  heartbeat: (uid: string) => `presence:heartbeat:${uid}`,
  data: (uid: string) => `presence:data:${uid}`,
};

@Injectable()
export class PresenceService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async handleConnect(userId: string): Promise<void> {
    await this.redis.setex(keys.heartbeat(userId), HEARTBEAT_TTL, '1');
    await this.patch(userId, {
      status: 'online',
      last_seen_at: new Date().toISOString(),
    });
  }

  async handleDisconnect(userId: string): Promise<void> {
    await this.redis.del(keys.heartbeat(userId));
    await this.patch(userId, {
      status: 'offline',
      last_seen_at: new Date().toISOString(),
    });
  }

  async heartbeat(userId: string): Promise<void> {
    await this.redis.setex(keys.heartbeat(userId), HEARTBEAT_TTL, '1');

    const current = await this.getPresence(userId);
    if (current?.status === 'idle') {
      await this.patch(userId, { status: 'online' });
    }
  }

  async sweepIdleUsers(userIds: string[]): Promise<string[]> {
    if (!userIds.length) return [];

    const pipeline = this.redis.pipeline();
    userIds.forEach((uid) => pipeline.exists(keys.heartbeat(uid)));
    const results = await pipeline.exec();

    const nowIdled: string[] = [];

    for (let i = 0; i < userIds.length; i++) {
      const alive = results?.[i]?.[1] as number;
      if (!alive) {
        const presence = await this.getPresence(userIds[i]);
        if (presence?.status === 'online') {
          await this.patch(userIds[i], { status: 'idle' });
          nowIdled.push(userIds[i]);
        }
      }
    }

    return nowIdled;
  }

  async updatePresence(
    userId: string,
    dto: UpdatePresenceDto,
  ): Promise<PresenceData> {
    const updates: Partial<PresenceData> = {};

    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.custom_status !== undefined)
      updates.custom_status = dto.custom_status;
    if (dto.current_activity !== undefined)
      updates.current_activity = dto.current_activity;

    await this.patch(userId, updates);
    return (await this.getPresence(userId))!;
  }

  async setCurrentActivity(
    userId: string,
    activity: string | null,
  ): Promise<void> {
    await this.patch(userId, { current_activity: activity });
  }

  async getPresence(userId: string): Promise<PresenceData> {
    const raw = await this.redis.get(keys.data(userId));
    if (!raw)
      return {
        status: 'offline',
        custom_status: null,
        current_activity: null,
        last_seen_at: null,
      };
    return JSON.parse(raw) as PresenceData;
  }

  async getBulkPresence(userIds: string[]): Promise<Map<string, PresenceData>> {
    const map = new Map<string, PresenceData>();
    if (!userIds.length) return map;

    const pipeline = this.redis.pipeline();
    userIds.forEach((uid) => pipeline.get(keys.data(uid)));
    const results = await pipeline.exec();

    userIds.forEach((uid, i) => {
      const raw = results?.[i]?.[1] as string | null;
      if (raw) map.set(uid, JSON.parse(raw) as PresenceData);
    });

    return map;
  }

  async getOnlineUserIds(): Promise<string[]> {
    const heartbeatKeys = await this.scanKeys('presence:heartbeat:*');
    return heartbeatKeys.map((k) => k.replace('presence:heartbeat:', ''));
  }

  private async patch(
    userId: string,
    updates: Partial<PresenceData>,
  ): Promise<void> {
    const current = await this.getPresence(userId);

    const defaults: PresenceData = {
      status: 'offline',
      custom_status: null,
      current_activity: null,
      last_seen_at: null,
    };

    const next: PresenceData = Object.assign(defaults, current ?? {}, updates);

    await this.redis.setex(
      keys.data(userId),
      PRESENCE_TTL,
      JSON.stringify(next),
    );
  }
  private async scanKeys(pattern: string): Promise<string[]> {
    const found: string[] = [];
    let cursor = '0';

    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = next;
      found.push(...batch);
    } while (cursor !== '0');

    return found;
  }
}
