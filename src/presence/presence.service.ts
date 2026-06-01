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

/** Mark idle when connected but no activity event for this long. */
export const IDLE_AFTER_MS = 5 * 60 * 1000;

const PRESENCE_TTL = 60 * 60 * 24;

const keys = {
  data: (uid: string) => `presence:data:${uid}`,
};

@Injectable()
export class PresenceService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async handleConnect(userId: string): Promise<PresenceData> {
    return this.touchActive(userId);
  }

  async handleDisconnect(userId: string): Promise<PresenceData> {
    await this.patch(userId, {
      status: 'offline',
      last_seen_at: new Date().toISOString(),
    });
    return (await this.getPresence(userId))!;
  }

  /** Called on window open/focus, tab visible, or session start/end — not on a timer. */
  async touchActive(userId: string): Promise<PresenceData> {
    await this.patch(userId, {
      status: 'online',
      last_seen_at: new Date().toISOString(),
    });
    return (await this.getPresence(userId))!;
  }

  async sweepIdleUsers(userIds: string[]): Promise<string[]> {
    if (!userIds.length) return [];

    const cutoff = Date.now() - IDLE_AFTER_MS;
    const nowIdled: string[] = [];

    for (const uid of userIds) {
      const presence = await this.getPresence(uid);
      if (presence.status !== 'online' || !presence.last_seen_at) continue;
      if (new Date(presence.last_seen_at).getTime() <= cutoff) {
        await this.patch(uid, { status: 'idle' });
        nowIdled.push(uid);
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
}
