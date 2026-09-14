import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import Redis from 'ioredis';
import { DailyStat } from '../entities/daily-stat.entity';
import { Friendship } from '../entities/friendship.entity';
import { User } from '../entities/user.entity';
import { UserPrivacy } from '../entities/user-privacy.entity';
import { LeaderboardEntryDto } from './dto/leaderboard.dto';

export type LeaderboardPeriod = 'today' | 'week' | 'alltime';

const boardKey = (uid: string, period: LeaderboardPeriod) =>
  `leaderboard:${period}:${uid}`;

const GLOBAL_ALLTIME_KEY = 'leaderboard:global:alltime';
const GLOBAL_TOP_N = 5;

const globalLast7dKey = (asOf: string) => `leaderboard:global:last7d:${asOf}`;

const CACHE_TTL: Record<LeaderboardPeriod, number> = {
  today: 5 * 60,
  week: 15 * 60,
  alltime: 60 * 60,
};

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

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

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as LeaderboardEntryDto[];
      }
    } catch (err) {
      this.logger.warn(
        `Friend leaderboard cache read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const entries = await this.buildLeaderboard(userId, period);

    try {
      await this.redis.setex(
        cacheKey,
        CACHE_TTL[period],
        JSON.stringify(entries),
      );
    } catch (err) {
      this.logger.warn(
        `Friend leaderboard cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return entries;
  }

  async invalidateForUser(userId: string): Promise<void> {
    const friendIds = await this.getFriendIds(userId);

    try {
      const pipeline = this.redis.pipeline();
      const periods: LeaderboardPeriod[] = ['today', 'week', 'alltime'];

      for (const fid of [...friendIds, userId]) {
        for (const period of periods) {
          pipeline.del(boardKey(fid, period));
        }
      }

      await pipeline.exec();
    } catch (err) {
      this.logger.warn(
        `Friend leaderboard invalidate failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Sync rolling last-7-days focus minutes into the global weekly Redis ZSET. */
  async updateGlobalWeek(userId: string): Promise<void> {
    const asOf = this.getTodayDate();
    const weekKey = globalLast7dKey(asOf);

    const privacy = await this.privacyRepo.findOne({
      where: { user_id: userId },
    });

    if (privacy && privacy.show_on_leaderboard === false) {
      try {
        await this.redis.zrem(weekKey, userId);
      } catch {
        // Redis unavailable — next read falls back to DB
      }
      return;
    }

    const { startDate, endDate } = this.getLast7DaysRange();
    const row = await this.dailyStatRepo
      .createQueryBuilder('d')
      .select('SUM(d.total_focus_minutes)', 'total')
      .where('d.userId = :uid', { uid: userId })
      .andWhere('d.date >= :start', { start: startDate })
      .andWhere('d.date <= :end', { end: endDate })
      .getRawOne<{ total: string | null }>();

    const total = parseInt(row?.total ?? '0', 10);

    try {
      if (total > 0) {
        await this.redis.zadd(weekKey, total, userId);
      } else {
        await this.redis.zrem(weekKey, userId);
      }
    } catch (err) {
      this.logger.warn(
        `Global week leaderboard write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Sync absolute all-time focus minutes into the global Redis ZSET. */
  async updateGlobalAllTime(userId: string): Promise<void> {
    const privacy = await this.privacyRepo.findOne({
      where: { user_id: userId },
    });

    if (privacy && privacy.show_on_leaderboard === false) {
      try {
        await this.redis.zrem(GLOBAL_ALLTIME_KEY, userId);
      } catch {
        // Redis unavailable — next read falls back to DB
      }
      return;
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'all_time_focus_minutes'],
    });
    const total = user?.all_time_focus_minutes ?? 0;

    try {
      await this.redis.zadd(GLOBAL_ALLTIME_KEY, total, userId);
    } catch (err) {
      this.logger.warn(
        `Global all-time leaderboard write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Top N last 7 days — Redis first, DB fallback (+ seed Redis). */
  async getGlobalWeekLeaderboard(
    viewerUserId?: string | null,
  ): Promise<LeaderboardEntryDto[]> {
    const weekKey = globalLast7dKey(this.getTodayDate());

    let top: LeaderboardEntryDto[] = [];

    try {
      const raw = await this.redis.zrevrange(
        weekKey,
        0,
        GLOBAL_TOP_N * 4 - 1,
        'WITHSCORES',
      );
      if (raw.length > 0) {
        const hydrated = await this.hydrateGlobal(raw);
        if (hydrated.length >= GLOBAL_TOP_N) {
          top = hydrated.slice(0, GLOBAL_TOP_N);
        } else if (hydrated.length > 0) {
          const fromDb = await this.buildGlobalWeekFromDb();
          const seen = new Set(hydrated.map((e) => e.user_id));
          const merged = [...hydrated];
          for (const entry of fromDb) {
            if (seen.has(entry.user_id)) continue;
            merged.push(entry);
          }
          merged.sort((a, b) => b.focus_minutes - a.focus_minutes);
          top = merged.slice(0, GLOBAL_TOP_N);
          top.forEach((e, i) => (e.rank = i + 1));
          await this.seedGlobalWeek(top);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Global week leaderboard Redis read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (top.length === 0) {
      const fromDb = await this.buildGlobalWeekFromDb();
      if (fromDb.length > 0) {
        await this.seedGlobalWeek(fromDb);
      }
      top = fromDb;
    }

    return this.appendViewerIfAbsent(top, viewerUserId, 'week');
  }

  /** Top N all-time — Redis first, DB fallback (+ seed Redis). */
  async getGlobalAllTimeLeaderboard(
    viewerUserId?: string | null,
  ): Promise<LeaderboardEntryDto[]> {
    let top: LeaderboardEntryDto[] = [];

    try {
      const raw = await this.redis.zrevrange(
        GLOBAL_ALLTIME_KEY,
        0,
        GLOBAL_TOP_N * 4 - 1,
        'WITHSCORES',
      );
      if (raw.length > 0) {
        const hydrated = await this.hydrateGlobal(raw);
        if (hydrated.length >= GLOBAL_TOP_N) {
          top = hydrated.slice(0, GLOBAL_TOP_N);
        } else if (hydrated.length > 0) {
          // Top up if privacy filters removed some Redis members.
          const fromDb = await this.buildGlobalFromDb();
          const seen = new Set(hydrated.map((e) => e.user_id));
          const merged = [...hydrated];
          for (const entry of fromDb) {
            if (seen.has(entry.user_id)) continue;
            merged.push(entry);
          }
          merged.sort((a, b) => b.focus_minutes - a.focus_minutes);
          top = merged.slice(0, GLOBAL_TOP_N);
          top.forEach((e, i) => (e.rank = i + 1));
          await this.seedGlobalAllTime(top);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Global all-time leaderboard Redis read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (top.length === 0) {
      const fromDb = await this.buildGlobalFromDb();
      if (fromDb.length > 0) {
        await this.seedGlobalAllTime(fromDb);
      }
      top = fromDb;
    }

    return this.appendViewerIfAbsent(top, viewerUserId, 'alltime');
  }

  private async seedGlobalAllTime(
    entries: LeaderboardEntryDto[],
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      for (const e of entries) {
        if (e.focus_minutes > 0) {
          pipeline.zadd(GLOBAL_ALLTIME_KEY, e.focus_minutes, e.user_id);
        }
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(
        `Global all-time leaderboard seed failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async seedGlobalWeek(
    entries: LeaderboardEntryDto[],
  ): Promise<void> {
    const weekKey = globalLast7dKey(this.getTodayDate());
    try {
      const pipeline = this.redis.pipeline();
      for (const e of entries) {
        if (e.focus_minutes > 0) {
          pipeline.zadd(weekKey, e.focus_minutes, e.user_id);
        }
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(
        `Global week leaderboard seed failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async hydrateGlobal(raw: string[]): Promise<LeaderboardEntryDto[]> {
    const ids: string[] = [];
    const scores = new Map<string, number>();
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(raw[i]);
      scores.set(raw[i], parseInt(raw[i + 1], 10));
    }

    if (!ids.length) return [];

    const [users, privacies] = await Promise.all([
      this.userRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.name', 'u.username', 'u.avatar_url'])
        .where('u.id IN (:...ids)', { ids })
        .getMany(),
      this.privacyRepo
        .createQueryBuilder('p')
        .where('p.user_id IN (:...ids)', { ids })
        .getMany(),
    ]);

    const optedOut = new Set(
      privacies.filter((p) => !p.show_on_leaderboard).map((p) => p.user_id),
    );
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Drop opted-out users (Redis may be stale until their next sync).
    if (optedOut.size > 0) {
      try {
        await this.redis.zrem(GLOBAL_ALLTIME_KEY, ...optedOut);
      } catch {
        // ignore
      }
    }

    return ids
      .filter((id) => userMap.has(id) && !optedOut.has(id))
      .map((id, i) => {
        const u = userMap.get(id)!;
        return {
          rank: i + 1,
          user_id: id,
          name: u.name,
          username: u.username ?? null,
          avatar_url: u.avatar_url ?? null,
          focus_minutes: scores.get(id) ?? 0,
        };
      });
  }

  private async buildGlobalWeekFromDb(): Promise<LeaderboardEntryDto[]> {
    const { startDate, endDate } = this.getLast7DaysRange();

    const stats = await this.dailyStatRepo
      .createQueryBuilder('d')
      .select('d.userId', 'user_id')
      .addSelect('SUM(d.total_focus_minutes)', 'total')
      .where('d.date >= :start', { start: startDate })
      .andWhere('d.date <= :end', { end: endDate })
      .groupBy('d.userId')
      .having('SUM(d.total_focus_minutes) > 0')
      .orderBy('total', 'DESC')
      .limit(40)
      .getRawMany<{ user_id: string; total: string }>();

    if (!stats.length) return [];

    const ids = stats.map((s) => s.user_id);
    const [users, privacies] = await Promise.all([
      this.userRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.name', 'u.username', 'u.avatar_url'])
        .where('u.id IN (:...ids)', { ids })
        .getMany(),
      this.privacyRepo
        .createQueryBuilder('p')
        .where('p.user_id IN (:...ids)', { ids })
        .getMany(),
    ]);

    const optedOut = new Set(
      privacies.filter((p) => !p.show_on_leaderboard).map((p) => p.user_id),
    );
    const userMap = new Map(users.map((u) => [u.id, u]));
    const statsMap = new Map(
      stats.map((s) => [s.user_id, parseInt(s.total, 10)]),
    );

    return ids
      .filter((id) => userMap.has(id) && !optedOut.has(id))
      .slice(0, GLOBAL_TOP_N)
      .map((id, i) => {
        const u = userMap.get(id)!;
        return {
          rank: i + 1,
          user_id: id,
          name: u.name,
          username: u.username ?? null,
          avatar_url: u.avatar_url ?? null,
          focus_minutes: statsMap.get(id) ?? 0,
        };
      });
  }

  private async buildGlobalFromDb(): Promise<LeaderboardEntryDto[]> {
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.name',
        'u.username',
        'u.avatar_url',
        'u.all_time_focus_minutes',
      ])
      .where('COALESCE(u.all_time_focus_minutes, 0) > 0')
      .orderBy('u.all_time_focus_minutes', 'DESC')
      .take(40)
      .getMany();

    if (!users.length) return [];

    const ids = users.map((u) => u.id);
    const privacies = await this.privacyRepo
      .createQueryBuilder('p')
      .where('p.user_id IN (:...ids)', { ids })
      .getMany();
    const optedOut = new Set(
      privacies.filter((p) => !p.show_on_leaderboard).map((p) => p.user_id),
    );

    return users
      .filter((u) => !optedOut.has(u.id))
      .slice(0, GLOBAL_TOP_N)
      .map((u, i) => ({
        rank: i + 1,
        user_id: u.id,
        name: u.name,
        username: u.username ?? null,
        avatar_url: u.avatar_url ?? null,
        focus_minutes: u.all_time_focus_minutes ?? 0,
      }));
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
      .select(['u.id', 'u.name', 'u.username', 'u.avatar_url'])
      .where('u.id IN (:...ids)', { ids: visibleIds })
      .getMany();

    const userMap = new Map(users.map((u) => [u.id, u]));
    const statsMap = new Map(
      stats.map((s) => [s.user_id, parseInt(s.total, 10)]),
    );

    const entries: LeaderboardEntryDto[] = visibleIds.map((uid) => {
      const u = userMap.get(uid)!;
      return {
        rank: 0,
        user_id: uid,
        name: u.name,
        username: u.username ?? null,
        avatar_url: u.avatar_url ?? null,
        focus_minutes: statsMap.get(uid) ?? 0,
      };
    });

    entries.sort((a, b) => b.focus_minutes - a.focus_minutes);
    entries.forEach((e, i) => (e.rank = i + 1));

    return entries;
  }

  /** 1-based rank on global week ZSET, or null if not ranked. */
  async getGlobalWeekRank(userId: string): Promise<number | null> {
    const weekKey = globalLast7dKey(this.getTodayDate());
    try {
      const rank = await this.redis.zrevrank(weekKey, userId);
      return rank == null ? null : rank + 1;
    } catch {
      return null;
    }
  }

  async getGlobalWeekScore(userId: string): Promise<number> {
    const weekKey = globalLast7dKey(this.getTodayDate());
    try {
      const score = await this.redis.zscore(weekKey, userId);
      return score == null ? 0 : Number(score);
    } catch {
      return 0;
    }
  }

  async getGlobalAllTimeRank(userId: string): Promise<number | null> {
    try {
      const rank = await this.redis.zrevrank(GLOBAL_ALLTIME_KEY, userId);
      return rank == null ? null : rank + 1;
    } catch {
      return null;
    }
  }

  async getGlobalAllTimeScore(userId: string): Promise<number> {
    try {
      const score = await this.redis.zscore(GLOBAL_ALLTIME_KEY, userId);
      return score == null ? 0 : Number(score);
    } catch {
      return 0;
    }
  }

  /**
   * If viewer is outside the top N, append their real rank/minutes
   * (e.g. top 5 then #15 you). Always appends when authenticated and not listed.
   */
  async appendViewerIfAbsent(
    entries: LeaderboardEntryDto[],
    viewerUserId?: string | null,
    period: 'week' | 'alltime' = 'week',
  ): Promise<LeaderboardEntryDto[]> {
    if (!viewerUserId) return entries;
    if (entries.some((e) => e.user_id === viewerUserId)) return entries;

    const user = await this.userRepo.findOne({
      where: { id: viewerUserId },
      select: ['id', 'name', 'username', 'avatar_url', 'all_time_focus_minutes'],
    });
    if (!user) return entries;

    let rank: number | null;
    let minutes: number;

    if (period === 'week') {
      rank = await this.getGlobalWeekRank(viewerUserId);
      minutes = await this.getGlobalWeekScore(viewerUserId);
      if (minutes <= 0) {
        minutes = await this.weekMinutesFromDb(viewerUserId);
      }
      if (rank == null && minutes > 0) {
        rank = await this.estimateWeekRank(minutes);
      }
    } else {
      rank = await this.getGlobalAllTimeRank(viewerUserId);
      minutes =
        (await this.getGlobalAllTimeScore(viewerUserId)) ||
        (user.all_time_focus_minutes ?? 0);
      if (rank == null && minutes > 0) {
        rank = await this.estimateAllTimeRank(minutes);
      }
    }

    // Still show the viewer even with 0 minutes / unknown rank.
    const resolvedRank =
      rank ?? Math.max(entries.length, GLOBAL_TOP_N) + 1;

    return [
      ...entries,
      {
        rank: resolvedRank,
        user_id: viewerUserId,
        name: user.name,
        username: user.username ?? null,
        avatar_url: user.avatar_url ?? null,
        focus_minutes: minutes,
      },
    ];
  }

  private async weekMinutesFromDb(userId: string): Promise<number> {
    const { startDate, endDate } = this.getLast7DaysRange();
    const row = await this.dailyStatRepo
      .createQueryBuilder('d')
      .select('SUM(d.total_focus_minutes)', 'total')
      .where('d.userId = :uid', { uid: userId })
      .andWhere('d.date >= :start', { start: startDate })
      .andWhere('d.date <= :end', { end: endDate })
      .getRawOne<{ total: string | null }>();
    return parseInt(row?.total ?? '0', 10) || 0;
  }

  /** 1-based rank among users with more week minutes (DB fallback). */
  private async estimateWeekRank(minutes: number): Promise<number> {
    const { startDate, endDate } = this.getLast7DaysRange();
    const above = await this.dailyStatRepo
      .createQueryBuilder('d')
      .select('d.userId', 'user_id')
      .addSelect('SUM(d.total_focus_minutes)', 'total')
      .where('d.date >= :start', { start: startDate })
      .andWhere('d.date <= :end', { end: endDate })
      .groupBy('d.userId')
      .having('SUM(d.total_focus_minutes) > :minutes', { minutes })
      .getRawMany();
    return above.length + 1;
  }

  private async estimateAllTimeRank(minutes: number): Promise<number> {
    const count = await this.userRepo
      .createQueryBuilder('u')
      .where('u.all_time_focus_minutes > :minutes', { minutes })
      .getCount();
    return count + 1;
  }

  /**
   * Users whose week score sat in (minutesBefore, minutesAfter] —
   * i.e. this user just passed them on the global week board.
   */
  async usersPassedOnWeek(
    actorId: string,
    minutesBefore: number,
    minutesAfter: number,
  ): Promise<Array<{ userId: string; name: string; minutes: number }>> {
    if (minutesAfter <= minutesBefore) return [];
    const weekKey = globalLast7dKey(this.getTodayDate());
    try {
      const raw = await this.redis.zrangebyscore(
        weekKey,
        `(${minutesBefore}`,
        minutesAfter,
        'WITHSCORES',
      );
      const ids: string[] = [];
      const scores = new Map<string, number>();
      for (let i = 0; i < raw.length; i += 2) {
        const id = raw[i];
        if (id === actorId) continue;
        ids.push(id);
        scores.set(id, Number(raw[i + 1]));
      }
      if (ids.length === 0) return [];
      const users = await this.userRepo.find({
        where: { id: In(ids) },
        select: ['id', 'name', 'username'],
      });
      return users.map((u) => ({
        userId: u.id,
        name: (u.name?.trim() || u.username || 'Someone').split(/\s+/)[0],
        minutes: scores.get(u.id) ?? 0,
      }));
    } catch (err) {
      this.logger.warn(
        `usersPassedOnWeek failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /** Rolling 7-day window ending today (inclusive). */
  private getLast7DaysRange(): { startDate: string; endDate: string } {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { startDate: fmt(start), endDate: fmt(today) };
  }

  private getWeekStartDate(): string {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return start.toISOString().split('T')[0];
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
      return { startDate: this.getWeekStartDate(), endDate: fmt(today) };
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
