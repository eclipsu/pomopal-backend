import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import {
  Space,
  SpaceView,
  type SpaceBaked,
  type SpaceLayout,
  type SpaceVisibility,
} from '../entities/space.entity';
import { SpaceStar } from '../entities/space-star.entity';
import { SoundLibrary } from '../entities/sound-library.entity';
import { User } from '../entities/user.entity';
import { UserPrivacy } from '../entities/user-privacy.entity';
import { StorageService } from '../storage/storage.service';
import { FriendshipService } from '../friendship/friendship.service';
import { UserService } from '../user/user.service';
import { PrivacyService } from '../privacy/privacy.service';
import { DailyStatsService } from '../daily-stats/daily-stats.service';
import { StreaksService } from '../streaks/streaks.service';
import { FontsService } from '../fonts/fonts.service';
import { parseCustomFontId } from '../fonts/font.util';
import {
  CreateSpaceDto,
  PublishSpaceDto,
  UpdateSpaceDto,
  normalizeVisibility,
  sanitizeLayout,
  slugifyTitle,
} from './dto/space.dto';

const CACHE_TTL_SEC = 120;
const FOCUS_ACTIVITY_TTL_SEC = 300; // 5 min
/** Non-admin users may own at most this many spaces. */
export const SPACE_LIMIT_PER_USER = 4;

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function focusActivityCacheKey(userId: string, to: string) {
  return `spaces:focus-activity:${userId}:${to}`;
}
const browseVerKey = () => 'spaces:browse:ver';
const browseKey = (ver: string, q: string, limit: number, offset: number) =>
  `spaces:browse:v${ver}:${q}:${limit}:${offset}`;
const slugKey = (slug: string) => `spaces:by-slug:${slug}`;
const sitemapKey = () => 'spaces:sitemap';
const profilesSitemapKey = () => 'profiles:sitemap';

@Injectable()
export class SpacesService {
  constructor(
    @InjectRepository(Space)
    private readonly spaces: Repository<Space>,
    @InjectRepository(SpaceView)
    private readonly views: Repository<SpaceView>,
    @InjectRepository(SpaceStar)
    private readonly stars: Repository<SpaceStar>,
    @InjectRepository(SoundLibrary)
    private readonly soundLibrary: Repository<SoundLibrary>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly storage: StorageService,
    private readonly fonts: FontsService,
    private readonly friends: FriendshipService,
    private readonly users: UserService,
    private readonly privacy: PrivacyService,
    private readonly dailyStats: DailyStatsService,
    private readonly streaks: StreaksService,
  ) {}

  async uploadBackground(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const key = await this.storage.saveSpaceBackground(file);
    return {
      key,
      url: this.storage.objectPublicUrl(key),
    };
  }

  private async ensureOwnerUsername(space: Space): Promise<Space> {
    if (!space.owner_id) return space;
    if (space.owner?.username) return space;
    const username = await this.users.ensureUsername(
      space.owner_id,
      space.owner?.name,
    );
    if (space.owner) space.owner.username = username;
    return space;
  }

  private pathFor(space: Space) {
    const username = space.owner?.username;
    if (!username || !space.slug) {
      return space.slug ? `/spaces/${space.slug}` : '/spaces';
    }
    return `/${username}/${space.slug}`;
  }

  private async toPublicEnsured(
    space: Space,
    extras: { starred_by_me?: boolean; can_edit?: boolean } = {},
  ) {
    await this.ensureOwnerUsername(space);
    return this.toPublic(space, extras);
  }

  private toPublic(
    space: Space,
    extras: { starred_by_me?: boolean; can_edit?: boolean } = {},
  ) {
    const visibility = normalizeVisibility(space.visibility);
    return {
      id: space.id,
      title: space.title,
      slug: space.slug,
      path: this.pathFor(space),
      description: space.description,
      tags: space.tags ?? [],
      visibility,
      cover_image_url: space.cover_image_url,
      layout: space.layout,
      /** Server-baked assets — prefer this over live library lookups. */
      baked: space.baked ?? null,
      baked_at: space.baked_at ?? null,
      layout_version: space.layout_version,
      view_count: space.view_count ?? 0,
      star_count: space.star_count ?? 0,
      fork_count: space.fork_count ?? 0,
      parent_space_id: space.parent_space_id ?? null,
      published_at: space.published_at,
      created_at: space.created_at,
      updated_at: space.updated_at,
      starred_by_me: extras.starred_by_me ?? false,
      can_edit: extras.can_edit ?? false,
      creator: space.owner
        ? {
            id: space.owner.id,
            name: space.owner.name,
            username: space.owner.username,
            avatar_url: space.owner.avatar_url ?? null,
          }
        : null,
    };
  }

  /**
   * Build an immutable snapshot of layout + resolved font/sound assets.
   * Remade only on creator save — served as-is forever until then.
   */
  private async bakeLayout(
    spaceId: string,
    layout: SpaceLayout,
  ): Promise<SpaceBaked> {
    let timerFont = layout.timerFont;
    let fontFamily: string | null = null;
    let fontUrl: string | null = null;

    const customId = parseCustomFontId(timerFont);
    if (customId) {
      const font = await this.fonts.findActiveById(customId);
      if (font) {
        timerFont = `font:${font.id}`;
        fontFamily = font.family_name;
        const bakedKey = await this.storage.copyFontToBakedSpace(
          font.s3_key,
          spaceId,
        );
        // Same-origin proxy path — not the raw S3 URL (CORS blocks @font-face).
        fontUrl = bakedKey
          ? `/fonts/baked/${spaceId}/file`
          : `/fonts/library/${font.id}/file`;
      } else {
        timerFont = 'inherit';
      }
    }

    const resolveSound = async (id: string | null | undefined) => {
      if (!id) return null;
      const sound = await this.soundLibrary.findOne({
        where: { id, active: true },
      });
      if (!sound) return null;
      return {
        id: sound.id,
        streamPath: `/sounds/library/${sound.id}/stream`,
        name: sound.name,
      };
    };

    const bakedLayout: SpaceLayout = { ...layout, timerFont };

    return {
      v: 1,
      baked_at: new Date().toISOString(),
      layout: bakedLayout,
      font: {
        token: timerFont,
        family: fontFamily,
        url: fontUrl,
      },
      ring: await resolveSound(layout.ringSoundId),
      focus: await resolveSound(layout.focusSoundId),
    };
  }

  private async applyBake(space: Space, layout: SpaceLayout): Promise<void> {
    const baked = await this.bakeLayout(space.id, layout);
    space.layout = baked.layout;
    space.baked = baked;
    space.baked_at = new Date(baked.baked_at);
    space.cover_image_url = this.coverFromLayout(baked.layout);
  }

  /** `{title-slug}-{uuid}` — unique forever; title is cosmetic in the path. */
  private newSlug(title: string): string {
    return `${slugifyTitle(title)}-${randomUUID()}`;
  }

  private coverFromLayout(layout: SpaceLayout): string | null {
    if (layout.backgroundType === 'gif') {
      return layout.backgroundGifPreviewUrl || layout.backgroundGifUrl;
    }
    if (layout.backgroundType === 'image') {
      return layout.backgroundImageUrl;
    }
    return null;
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown): Promise<void> {
    await this.redis.setex(key, CACHE_TTL_SEC, JSON.stringify(value));
  }

  private async invalidatePublicCaches(slug?: string | null): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.incr(browseVerKey());
    pipeline.del(sitemapKey());
    pipeline.del(profilesSitemapKey());
    if (slug) pipeline.del(slugKey(slug));
    await pipeline.exec();
  }

  private async assertCanView(
    space: Space,
    viewerId?: string,
  ): Promise<void> {
    const visibility = normalizeVisibility(space.visibility);
    if (viewerId && viewerId === space.owner_id) return;

    if (visibility === 'public') return;

    if (visibility === 'private') {
      throw new NotFoundException('Space not found');
    }

    // friends
    if (!viewerId) throw new NotFoundException('Space not found');
    const ok = await this.friends.areFriends(viewerId, space.owner_id);
    if (!ok) throw new NotFoundException('Space not found');
  }

  private async assertUnderSpaceCap(ownerId: string): Promise<void> {
    const user = await this.users.findOne(ownerId);
    if (user.role === 'admin') return;

    const count = await this.spaces.count({ where: { owner_id: ownerId } });
    if (count >= SPACE_LIMIT_PER_USER) {
      throw new ForbiddenException(
        `You can have at most ${SPACE_LIMIT_PER_USER} spaces. Delete one to create or fork another.`,
      );
    }
  }

  async create(ownerId: string, dto: CreateSpaceDto) {
    await this.assertUnderSpaceCap(ownerId);
    const layout = sanitizeLayout(dto.layout);
    const title = dto.title.trim().slice(0, 80);
    const space = this.spaces.create({
      owner_id: ownerId,
      title,
      slug: this.newSlug(title),
      description: dto.description?.trim().slice(0, 500) || null,
      tags: (dto.tags ?? [])
        .map((t) => t.trim().toLowerCase().slice(0, 32))
        .filter(Boolean)
        .slice(0, 12),
      visibility: normalizeVisibility(dto.visibility ?? 'public'),
      layout,
      cover_image_url: this.coverFromLayout(layout),
      baked: null,
      baked_at: null,
      layout_version: 1,
      view_count: 0,
      star_count: 0,
      fork_count: 0,
      parent_space_id: null,
      published_at: new Date(),
    });
    const saved = await this.spaces.save(space);
    // Need space id before baking (immutable font copy lives under spaces/baked/{id}/).
    await this.applyBake(saved, layout);
    await this.spaces.save(saved);
    await this.invalidatePublicCaches(saved.slug);
    return this.findOwned(ownerId, saved.id);
  }

  async listMine(ownerId: string) {
    const rows = await this.spaces.find({
      where: { owner_id: ownerId },
      relations: ['owner'],
      order: { updated_at: 'DESC' },
    });
    const user = await this.users.findOne(ownerId);
    const isAdmin = user.role === 'admin';
    const items = await Promise.all(
      rows.map((s) => this.toPublicEnsured(s, { can_edit: true })),
    );
    return {
      items,
      count: items.length,
      limit: isAdmin ? null : SPACE_LIMIT_PER_USER,
      can_create: isAdmin || items.length < SPACE_LIMIT_PER_USER,
    };
  }

  async findOwned(ownerId: string, id: string) {
    const space = await this.spaces.findOne({
      where: { id, owner_id: ownerId },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');
    return this.toPublicEnsured(space, { can_edit: true });
  }

  async update(ownerId: string, id: string, dto: UpdateSpaceDto) {
    const space = await this.spaces.findOne({
      where: { id, owner_id: ownerId },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');

    const prevSlug = space.slug;
    const patch: Partial<Space> = {};

    if (dto.title !== undefined) {
      patch.title = dto.title.trim().slice(0, 80);
    }
    if (dto.description !== undefined) {
      patch.description = dto.description?.trim().slice(0, 500) || null;
    }
    if (dto.tags !== undefined) {
      patch.tags = dto.tags
        .map((t) => t.trim().toLowerCase().slice(0, 32))
        .filter(Boolean)
        .slice(0, 12);
    }
    if (dto.layout !== undefined) {
      const layout = sanitizeLayout(dto.layout);
      await this.applyBake(space, layout);
      patch.layout = space.layout;
      patch.baked = space.baked;
      patch.baked_at = space.baked_at;
      patch.cover_image_url = space.cover_image_url;
      patch.layout_version = (space.layout_version ?? 1) + 1;
    }

    if (Object.keys(patch).length > 0) {
      await this.spaces.update({ id, owner_id: ownerId }, patch);
      Object.assign(space, patch);
    }

    await this.invalidatePublicCaches(prevSlug);
    return this.toPublicEnsured(space, { can_edit: true });
  }

  async publish(ownerId: string, id: string, dto: PublishSpaceDto) {
    const space = await this.spaces.findOne({
      where: { id, owner_id: ownerId },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');

    space.visibility = normalizeVisibility(dto.visibility);
    space.published_at = space.published_at ?? new Date();
    await this.spaces.save(space);
    await this.invalidatePublicCaches(space.slug);
    return this.toPublicEnsured(space, { can_edit: true });
  }

  async unpublish(ownerId: string, id: string) {
    const space = await this.spaces.findOne({
      where: { id, owner_id: ownerId },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');
    space.visibility = 'private';
    await this.spaces.save(space);
    await this.invalidatePublicCaches(space.slug);
    return this.toPublicEnsured(space, { can_edit: true });
  }

  async setVisibility(
    ownerId: string,
    id: string,
    visibility: SpaceVisibility,
  ) {
    return this.publish(ownerId, id, { visibility });
  }

  async remove(ownerId: string, id: string) {
    const space = await this.spaces.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!space) throw new NotFoundException('Space not found');
    const slug = space.slug;
    await this.spaces.remove(space);
    await this.invalidatePublicCaches(slug);
    return { ok: true };
  }

  async browse(query?: string, limit = 24, offset = 0) {
    const take = Math.min(50, Math.max(1, limit));
    const skip = Math.max(0, offset);
    const qNorm = (query?.trim().toLowerCase() || '').slice(0, 100);

    const ver = (await this.redis.get(browseVerKey())) || '0';
    const key = browseKey(ver, qNorm, take, skip);
    const cached = await this.cacheGet<{ total: number; items: unknown[] }>(
      key,
    );
    if (cached) return cached;

    const qb = this.spaces
      .createQueryBuilder('space')
      .leftJoinAndSelect('space.owner', 'owner')
      .where('space.visibility = :vis', { vis: 'public' })
      .orderBy('space.view_count', 'DESC')
      .addOrderBy('space.published_at', 'DESC')
      .take(take)
      .skip(skip);

    if (qNorm) {
      const q = `%${qNorm}%`;
      qb.andWhere(
        `(LOWER(space.title) LIKE :q OR LOWER(COALESCE(space.description, '')) LIKE :q OR EXISTS (
          SELECT 1 FROM unnest(space.tags) t WHERE t LIKE :q
        ))`,
        { q },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map((s) => this.toPublicEnsured(s)));
    const result = {
      total,
      items,
    };
    await this.cacheSet(key, result);
    return result;
  }

  async findBySlug(slug: string, viewerId?: string) {
    const space = await this.spaces.findOne({
      where: { slug },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');
    await this.assertCanView(space, viewerId);

    const starred_by_me = viewerId
      ? await this.stars.exist({
          where: { space_id: space.id, user_id: viewerId },
        })
      : false;

    return this.toPublicEnsured(space, {
      starred_by_me,
      can_edit: Boolean(viewerId && viewerId === space.owner_id),
    });
  }

  async findByUsernameAndSlug(
    username: string,
    spaceSlug: string,
    viewerId?: string,
  ) {
    const owner = await this.users.findByUsername(username);
    if (!owner) throw new NotFoundException('Space not found');

    const space = await this.spaces.findOne({
      where: { slug: spaceSlug, owner_id: owner.id },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');
    await this.assertCanView(space, viewerId);

    const starred_by_me = viewerId
      ? await this.stars.exist({
          where: { space_id: space.id, user_id: viewerId },
        })
      : false;

    return this.toPublicEnsured(space, {
      starred_by_me,
      can_edit: Boolean(viewerId && viewerId === space.owner_id),
    });
  }

  async listByUsername(username: string, viewerId?: string) {
    const owner = await this.users.findByUsername(username);
    if (!owner) throw new NotFoundException('User not found');

    await this.assertCanViewProfile(owner.id, viewerId);

    const rows = await this.spaces.find({
      where: { owner_id: owner.id },
      relations: ['owner'],
      order: { updated_at: 'DESC' },
    });

    const visible: Space[] = [];
    for (const space of rows) {
      try {
        await this.assertCanView(space, viewerId);
        visible.push(space);
      } catch {
        // skip
      }
    }

    return Promise.all(
      visible.map((s) =>
        this.toPublicEnsured(s, {
          can_edit: Boolean(viewerId && viewerId === s.owner_id),
        }),
      ),
    );
  }

  async getProfile(username: string, viewerId?: string) {
    const owner = await this.users.findByUsername(username);
    if (!owner) throw new NotFoundException('User not found');

    await this.assertCanViewProfile(owner.id, viewerId);

    const spaces = await this.listByUsername(username, viewerId);
    const privacy = await this.privacy.getPrivacy(owner.id);

    let focus_activity: {
      from: string;
      to: string;
      days: { date: string; minutes: number }[];
      total_minutes: number;
      active_days: number;
    } | null = null;

    if (privacy.show_daily_stats) {
      focus_activity = await this.getFocusActivityCached(owner.id);
    }

    let streak: {
      current_streak: number;
      longest_streak: number;
    } | null = null;

    if (privacy.show_streak) {
      streak = await this.streaks.get(owner.id);
    }

    return {
      id: owner.id,
      name: owner.name,
      username: owner.username,
      avatar_url: owner.avatar_url ?? null,
      created_at: owner.created_at,
      all_time_focus_minutes: privacy.show_total_focus_time
        ? (owner.all_time_focus_minutes ?? 0)
        : null,
      profile_public: privacy.profile_public,
      is_owner: Boolean(viewerId && viewerId === owner.id),
      focus_activity,
      streak,
      spaces,
    };
  }

  /** Precomputed sparse year activity; Redis TTL 5 min. */
  private async getFocusActivityCached(userId: string) {
    const to = todayYmdUtc();
    const from = addDaysYmd(to, -(52 * 7 + 6));
    const key = focusActivityCacheKey(userId, to);

    try {
      const raw = await this.redis.get(key);
      if (raw) {
        return JSON.parse(raw) as {
          from: string;
          to: string;
          days: { date: string; minutes: number }[];
          total_minutes: number;
          active_days: number;
        };
      }
    } catch {
      // miss / parse error — recompute
    }

    const days = await this.dailyStats.getActiveDays(userId, from, to);
    const total_minutes = days.reduce((s, d) => s + d.minutes, 0);
    const payload = {
      from,
      to,
      days,
      total_minutes,
      active_days: days.length,
    };

    try {
      await this.redis.setex(
        key,
        FOCUS_ACTIVITY_TTL_SEC,
        JSON.stringify(payload),
      );
    } catch {
      // ignore cache write failures
    }

    return payload;
  }

  private async assertCanViewProfile(
    ownerId: string,
    viewerId?: string,
  ): Promise<void> {
    if (viewerId && viewerId === ownerId) return;
    const privacy = await this.privacy.getPrivacy(ownerId);
    if (privacy.profile_public) return;
    if (!viewerId) throw new NotFoundException('Profile not found');
    const ok = await this.friends.areFriends(viewerId, ownerId);
    if (!ok) throw new NotFoundException('Profile not found');
  }

  async recordView(slug: string, viewerKey: string, viewerId?: string) {
    const space = await this.spaces.findOne({
      where: { slug },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');
    await this.assertCanView(space, viewerId);

    const viewer_hash = createHash('sha256')
      .update(viewerKey)
      .digest('hex')
      .slice(0, 64);
    const viewed_on = new Date().toISOString().slice(0, 10);

    try {
      await this.views.insert({
        space_id: space.id,
        viewer_hash,
        viewed_on,
      });
      await this.spaces.increment({ id: space.id }, 'view_count', 1);
      await this.invalidatePublicCaches(slug);
    } catch {
      // already counted today
    }

    return this.findBySlug(slug, viewerId);
  }

  async star(viewerId: string, slug: string) {
    const space = await this.spaces.findOne({
      where: { slug },
      relations: ['owner'],
    });
    if (!space) throw new NotFoundException('Space not found');
    await this.assertCanView(space, viewerId);

    try {
      await this.stars.insert({ space_id: space.id, user_id: viewerId });
      await this.spaces.increment({ id: space.id }, 'star_count', 1);
      await this.invalidatePublicCaches(slug);
    } catch {
      // already starred
    }
    return this.findBySlug(slug, viewerId);
  }

  async unstar(viewerId: string, slug: string) {
    const space = await this.spaces.findOne({ where: { slug } });
    if (!space) throw new NotFoundException('Space not found');

    const existing = await this.stars.findOne({
      where: { space_id: space.id, user_id: viewerId },
    });
    if (existing) {
      await this.stars.remove(existing);
      if ((space.star_count ?? 0) > 0) {
        await this.spaces.decrement({ id: space.id }, 'star_count', 1);
      }
      await this.invalidatePublicCaches(slug);
    }
    return this.findBySlug(slug, viewerId);
  }

  /** Fork into a new public space owned by the remixer — original never mutates */
  async remix(viewerId: string, slug: string) {
    await this.assertUnderSpaceCap(viewerId);
    const original = await this.spaces.findOne({
      where: { slug },
      relations: ['owner'],
    });
    if (!original) throw new NotFoundException('Space not found');
    await this.assertCanView(original, viewerId);

    const title = `${original.title} (fork)`.slice(0, 80);
    const copy = this.spaces.create({
      owner_id: viewerId,
      title,
      slug: this.newSlug(title),
      description: original.description,
      tags: [...(original.tags ?? [])],
      visibility: 'public',
      layout: { ...original.layout },
      cover_image_url: original.cover_image_url,
      baked: null,
      baked_at: null,
      layout_version: 1,
      view_count: 0,
      star_count: 0,
      fork_count: 0,
      parent_space_id: original.id,
      published_at: new Date(),
    });
    const saved = await this.spaces.save(copy);
    await this.applyBake(saved, saved.layout);
    await this.spaces.save(saved);
    await this.spaces.increment({ id: original.id }, 'fork_count', 1);
    await this.invalidatePublicCaches(original.slug);
    await this.invalidatePublicCaches(saved.slug);
    return this.findOwned(viewerId, saved.id);
  }

  async listPublicSlugs() {
    const cached = await this.cacheGet<
      { slug: string; username: string | null; updated_at: string }[]
    >(sitemapKey());
    if (cached) return cached;

    const rows = await this.spaces.find({
      where: { visibility: 'public' },
      relations: ['owner'],
      order: { updated_at: 'DESC' },
      take: 5000,
    });
    const result: {
      slug: string;
      username: string | null;
      path: string;
      updated_at: Date;
    }[] = [];
    for (const r of rows) {
      await this.ensureOwnerUsername(r);
      result.push({
        slug: r.slug,
        username: r.owner?.username ?? null,
        path: this.pathFor(r),
        updated_at: r.updated_at,
      });
    }
    await this.cacheSet(sitemapKey(), result);
    return result;
  }

  /** Public profiles for sitemap.xml (profile_public, username set). */
  async listPublicProfiles() {
    const cached = await this.cacheGet<
      { username: string; path: string; updated_at: string }[]
    >(profilesSitemapKey());
    if (cached) return cached;

    const rows = await this.userRepo
      .createQueryBuilder('u')
      .leftJoin(UserPrivacy, 'p', 'p.user_id = u.id')
      .where('u.username IS NOT NULL')
      .andWhere("u.username <> ''")
      .andWhere('(p.profile_public IS NULL OR p.profile_public = true)')
      .select(['u.username AS username', 'u.updated_at AS updated_at'])
      .orderBy('u.updated_at', 'DESC')
      .take(5000)
      .getRawMany<{ username: string; updated_at: Date }>();

    const result = rows.map((r) => ({
      username: r.username,
      path: `/${r.username}`,
      updated_at: r.updated_at,
    }));
    await this.cacheSet(profilesSitemapKey(), result);
    return result;
  }
}
