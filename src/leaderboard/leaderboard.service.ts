import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { DailyStat } from '../entities/daily-stat.entity';
import { Friendship } from '../entities/friendship.entity';
import { User } from '../entities/user.entity';
import { UserPrivacy } from '../entities/user-privacy.entity';
import { LeaderboardEntryDto } from './dto/leaderboard.dto';

export type LeaderboardPeriod = 'today' | 'week' | 'alltime';

const boardKey = (uid: string, period: LeaderboardPeriod) =>
  `leaderboard:${period}:${uid}`;

const CACHE_TTL: Record<LeaderboardPeriod, number> = {
  today: 5 * 60,
  week: 15 * 60,
  alltime: 60 * 60,
};

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(DailyStat)
    private readonly dailyStatRepo: Repository<DailyStat>,

    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(UserPrivacy)
    private readonly privacyRepo: Repository<UserPrivacy>,

    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async getFriendLeaderboard(
    userId: string,
    period: LeaderboardPeriod = 'week',
  ): Promise<LeaderboardEntryDto[]> {
    const cacheKey = boardKey(userId, period);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as LeaderboardEntryDto[];
    }

    const entries = await this.buildLeaderboard(userId, period);

    await this.redis.setex(
      cacheKey,
      CACHE_TTL[period],
      JSON.stringify(entries),
    );

    return entries;
  }

  async invalidateForUser(userId: string): Promise<void> {
    const friendIds = await this.getFriendIds(userId);

    const pipeline = this.redis.pipeline();
    const periods: LeaderboardPeriod[] = ['today', 'week', 'alltime'];

    for (const fid of [...friendIds, userId]) {
      for (const period of periods) {
        pipeline.del(boardKey(fid, period));
      }
    }

    await pipeline.exec();
  }

  private async buildLeaderboard(
    userId: string,
    period: LeaderboardPeriod,
  ): Promise<LeaderboardEntryDto[]> {
    const friendIds = await this.getFriendIds(userId);
    const participantIds = [...friendIds, userId];

    const privacies = await this.privacyRepo
      .createQueryBuilder('p')
      .where('p.user_id IN (:...ids)', { ids: participantIds })
      .getMany();

    const optedOut = new Set(
      privacies.filter((p) => !p.show_on_leaderboard).map((p) => p.user_id),
    );

    const visibleIds = participantIds.filter((id) => !optedOut.has(id));
    if (!visibleIds.length) return [];

    const { startDate, endDate } = this.getDateRange(period);

    const stats = await this.dailyStatRepo
      .createQueryBuilder('d')
      .select('d.userId', 'user_id')
      .addSelect('SUM(d.total_focus_minutes)', 'total')
      .where('d.userId IN (:...ids)', { ids: visibleIds })
      .andWhere('d.date >= :start', { start: startDate })
      .andWhere('d.date <= :end', { end: endDate })
      .groupBy('d.userId')
      .getRawMany<{ user_id: string; total: string }>();

    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.name', 'u.avatar_url'])
      .where('u.id IN (:...ids)', { ids: visibleIds })
      .getMany();

    const userMap = new Map(users.map((u) => [u.id, u]));
    const statsMap = new Map(
      stats.map((s) => [s.user_id, parseInt(s.total, 10)]),
    );

    const entries: LeaderboardEntryDto[] = visibleIds.map((uid) => {
      const u = userMap.get(uid)!;
      return {
        rank: 0, // filled below
        user_id: uid,
        name: u.name,
        avatar_url: u.avatar_url ?? null,
        focus_minutes: statsMap.get(uid) ?? 0,
      };
    });

    entries.sort((a, b) => b.focus_minutes - a.focus_minutes);
    entries.forEach((e, i) => (e.rank = i + 1));

    return entries;
  }

  private getDateRange(period: LeaderboardPeriod): {
    startDate: string;
    endDate: string;
  } {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    if (period === 'today') {
      const s = fmt(today);
      return { startDate: s, endDate: s };
    }

    if (period === 'week') {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay()); // Sunday
      return { startDate: fmt(start), endDate: fmt(today) };
    }

    return { startDate: '2000-01-01', endDate: fmt(today) };
  }

  private async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoin('f.requester', 'requester')
      .leftJoin('f.addressee', 'addressee')
      .where('f.status = :status', { status: 'accepted' })
      .andWhere('(requester.id = :uid OR addressee.id = :uid)', { uid: userId })
      .select(['f.id'])
      .addSelect('requester.id', 'requesterId')
      .addSelect('addressee.id', 'addresseeId')
      .getRawMany<{ requesterId: string; addresseeId: string }>();

    return friendships
      .map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId))
      .filter((id): id is string => !!id);
  }
}
