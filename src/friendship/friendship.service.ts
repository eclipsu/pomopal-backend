/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Friendship } from '../entities/friendship.entity';
import { User } from '../entities/user.entity';
import { UserPrivacy } from '../entities/user-privacy.entity';
import { SendFriendInviteDto } from './dto/send-friend-invite.dto';
import { FriendProfileDto } from './dto/friend-profile.dto';
import { PendingFriendRequestDto } from './dto/pending-friend-request.dto';
import { MailService } from '../mail/mail.service';
import { StreaksService } from 'src/streaks/streaks.service';
import { DailyStatsService } from 'src/daily-stats/daily-stats.service';
import { LeaderboardService } from 'src/leaderboard/leaderboard.service';
import { PresenceService, PresenceData } from '../presence/presence.service';
import { Streak } from 'src/entities/streak.entity';
import { FriendProfileVisibilityDto } from './dto/friend-profile-visibility.dto';

interface InviteTokenPayload {
  friendship_id: string;
  addressee_email: string;
  iat: number;
}

@Injectable()
export class FriendshipService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(UserPrivacy)
    private readonly privacyRepo: Repository<UserPrivacy>,

    @InjectRepository(Streak)
    private readonly streakRepo: Repository<Streak>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly streakService: StreaksService,
    private readonly dailyStatsService: DailyStatsService,
    private readonly leaderboardService: LeaderboardService,
    private readonly presenceService: PresenceService,
    private readonly dataSource: DataSource,
  ) {}

  async sendInvite(
    requesterId: string,
    dto: SendFriendInviteDto,
  ): Promise<void> {
    const requester = await this.userRepo.findOneByOrFail({ id: requesterId });

    if (requester.email === dto.email) {
      throw new BadRequestException('You cannot add yourself as a friend.');
    }

    const addressee = await this.userRepo.findOneBy({ email: dto.email });

    if (addressee) {
      const existing = await this.findFriendshipBetween(
        requesterId,
        addressee.id,
      );

      if (existing) {
        if (existing.status === 'accepted')
          throw new ConflictException('You are already friends.');
        if (existing.status === 'blocked')
          throw new ConflictException('Unable to send friend request.');
        if (existing.status === 'pending') {
          await this.regenerateAndSendToken(
            existing,
            dto.email,
            requester.name,
          );
          return;
        }
      }
    }

    const friendship = this.friendshipRepo.create({
      requester: { id: requesterId },
      addressee: addressee ? { id: addressee.id } : null,
      status: 'pending',
    });

    const saved = await this.friendshipRepo.save(friendship);
    await this.regenerateAndSendToken(saved, dto.email, requester.name);
  }

  private async regenerateAndSendToken(
    friendship: Friendship,
    addresseeEmail: string,
    requesterName: string,
  ): Promise<void> {
    const payload: InviteTokenPayload = {
      friendship_id: friendship.id,
      addressee_email: addresseeEmail,
      iat: Math.floor(Date.now() / 1000),
    };

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.friendshipRepo.update(friendship.id, {
      invite_token: token,
      invite_token_expires_at: expiresAt,
    });

    const appUrl = this.configService.get<string>('APP_URL');
    const link = `${appUrl}/friends/accept?token=${token}`;

    await this.mailService.sendFriendInvite({
      to: addresseeEmail,
      requesterName,
      acceptLink: link,
      expiresAt,
    });
  }

  async acceptInvite(
    token: string,
    acceptingUserId: string,
  ): Promise<Friendship> {
    let payload: InviteTokenPayload;

    try {
      payload = this.jwtService.verify<InviteTokenPayload>(token);
    } catch {
      throw new BadRequestException('Invalid or expired invite link.');
    }

    const friendship = await this.friendshipRepo.findOne({
      where: { id: payload.friendship_id },
      relations: ['requester'],
    });

    if (!friendship) throw new NotFoundException('Friend request not found.');
    if (friendship.status !== 'pending')
      throw new BadRequestException('This invite has already been used.');
    if (friendship.invite_token !== token)
      throw new BadRequestException('This invite link has been superseded.');
    if (
      !friendship.invite_token_expires_at ||
      friendship.invite_token_expires_at < new Date()
    )
      throw new BadRequestException(
        'This invite link has expired. Ask your friend to resend.',
      );

    const acceptingUser = await this.userRepo.findOneByOrFail({
      id: acceptingUserId,
    });
    if (acceptingUser.email !== payload.addressee_email) {
      throw new UnauthorizedException(
        'This invite was sent to a different email address.',
      );
    }

    return this.dataSource.transaction(async (em) => {
      await em.update(Friendship, friendship.id, {
        status: 'accepted',
        invite_token: null,
        invite_token_expires_at: null,
        accepted_at: new Date(),
      });

      await em
        .createQueryBuilder()
        .relation(Friendship, 'addressee')
        .of(friendship.id)
        .set(acceptingUserId);

      await this.ensurePrivacy(em, friendship.requester.id);
      await this.ensurePrivacy(em, acceptingUserId);

      return em.findOneOrFail(Friendship, {
        where: { id: friendship.id },
        relations: ['requester', 'addressee'],
      });
    });
  }

  async unfriend(userId: string, friendId: string): Promise<void> {
    const friendship = await this.findFriendshipBetween(userId, friendId);
    if (!friendship || friendship.status !== 'accepted') {
      throw new NotFoundException('Friendship not found.');
    }
    await this.friendshipRepo.remove(friendship);
  }

  async areFriends(userA: string, userB: string): Promise<boolean> {
    if (!userA || !userB || userA === userB) return false;
    const row = await this.friendshipRepo
      .createQueryBuilder('f')
      .where('f.status = :status', { status: 'accepted' })
      .andWhere(
        '((f.requester_id = :a AND f.addressee_id = :b) OR (f.requester_id = :b AND f.addressee_id = :a))',
        { a: userA, b: userB },
      )
      .getOne();
    return Boolean(row);
  }

  async block(userId: string, targetId: string): Promise<void> {
    const existing = await this.findFriendshipBetween(userId, targetId);

    if (existing) {
      await this.friendshipRepo.update(existing.id, {
        status: 'blocked',
        invite_token: null,
        invite_token_expires_at: null,
      });
    } else {
      await this.friendshipRepo.save(
        this.friendshipRepo.create({
          requester: { id: userId },
          addressee: { id: targetId },
          status: 'blocked',
        }),
      );
    }
  }

  async listFriends(userId: string): Promise<FriendProfileDto[]> {
    const friendships = await this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.requester', 'requester')
      .leftJoinAndSelect('f.addressee', 'addressee')
      .where('f.status = :status', { status: 'accepted' })
      .andWhere('(requester.id = :uid OR addressee.id = :uid)', { uid: userId })
      .getMany();

    const friendIds = friendships
      .map((f) =>
        f.requester?.id === userId ? f.addressee?.id : f.requester?.id,
      )
      .filter((id): id is string => !!id);

    if (!friendIds.length) return [];

    const [presenceMap, privacies, streakResults] = await Promise.all([
      this.presenceService.getBulkPresence(friendIds),
      this.privacyRepo
        .createQueryBuilder('p')
        .where('p.user_id IN (:...ids)', { ids: friendIds })
        .getMany(),
      Promise.all(
        friendIds.map((id) =>
          this.streakService.get(id).then((s) => ({ id, ...s })),
        ),
      ),
    ]);

    const privacyMap = new Map(privacies.map((p) => [p.user_id, p]));
    const streakMap = new Map(streakResults.map((s) => [s.id, s]));
    return friendships
      .filter((f) => {
        const friend = f.requester?.id === userId ? f.addressee : f.requester;
        return friend !== null && friend !== undefined;
      })
      .map((f) => {
        const friend = f.requester?.id === userId ? f.addressee! : f.requester!;
        const streak = streakMap.get(friend.id);
        return this.buildFriendProfile(
          friend,
          presenceMap.get(friend.id),
          privacyMap.get(friend.id),
          streak
            ? {
                streak: {
                  current_streak: streak.current_streak,
                  longest_streak: streak.longest_streak,
                },
              }
            : undefined,
        );
      });
  }

  async getFriendProfile(
    userId: string,
    friendId: string,
  ): Promise<FriendProfileDto> {
    const friendship = await this.findFriendshipBetween(userId, friendId);
    if (!friendship || friendship.status !== 'accepted') {
      throw new NotFoundException('Friend not found.');
    }

    const [friend, presence, privacy, streak, todayStat, totalMinutes, leaderboard] =
      await Promise.all([
        this.userRepo.findOneByOrFail({ id: friendId }),
        this.presenceService.getPresence(friendId),
        this.privacyRepo.findOneBy({ user_id: friendId }),
        this.streakService.get(friendId),
        this.dailyStatsService.getDailyStat(friendId),
        this.dailyStatsService.getTotalFocusMinutes(friendId),
        this.leaderboardService.getFriendLeaderboard(userId, 'week'),
      ]);

    const leaderboardEntry = leaderboard.find((e) => e.user_id === friendId);

    return this.buildFriendProfile(friend, presence ?? undefined, privacy ?? undefined, {
      streak,
      todayFocusMinutes: todayStat.total_focus_minutes,
      totalFocusMinutes: totalMinutes,
      leaderboardRank: leaderboardEntry?.rank,
    });
  }

  async listPendingReceived(userId: string): Promise<PendingFriendRequestDto[]> {
    const rows = await this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.requester', 'requester')
      .leftJoin('f.addressee', 'addressee')
      .where('addressee.id = :uid', { uid: userId })
      .andWhere('f.status = :status', { status: 'pending' })
      .orderBy('f.created_at', 'DESC')
      .getMany();

    return rows.map((f) => this.toPendingRequestDto(f));
  }

  async listPendingSent(userId: string): Promise<PendingFriendRequestDto[]> {
    const rows = await this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.addressee', 'addressee')
      .leftJoin('f.requester', 'requester')
      .where('requester.id = :uid', { uid: userId })
      .andWhere('f.status = :status', { status: 'pending' })
      .orderBy('f.created_at', 'DESC')
      .getMany();

    return rows.map((f) => this.toPendingRequestDto(f));
  }

  async acceptPendingRequest(
    userId: string,
    friendshipId: string,
  ): Promise<Friendship> {
    const friendship = await this.friendshipRepo.findOne({
      where: { id: friendshipId, status: 'pending' },
      relations: ['requester', 'addressee'],
    });

    if (!friendship || friendship.addressee?.id !== userId) {
      throw new NotFoundException('Friend request not found.');
    }

    return this.dataSource.transaction(async (em) => {
      await em.update(Friendship, friendship.id, {
        status: 'accepted',
        invite_token: null,
        invite_token_expires_at: null,
        accepted_at: new Date(),
      });

      await this.ensurePrivacy(em, friendship.requester.id);
      await this.ensurePrivacy(em, userId);

      return em.findOneOrFail(Friendship, {
        where: { id: friendship.id },
        relations: ['requester', 'addressee'],
      });
    });
  }

  async cancelPending(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.friendshipRepo.findOne({
      where: { id: friendshipId, status: 'pending' },
      relations: ['requester', 'addressee'],
    });

    if (!friendship) {
      throw new NotFoundException('Friend request not found.');
    }

    const isRequester = friendship.requester?.id === userId;
    const isAddressee = friendship.addressee?.id === userId;
    if (!isRequester && !isAddressee) {
      throw new NotFoundException('Friend request not found.');
    }

    await this.friendshipRepo.remove(friendship);
  }

  private async findFriendshipBetween(
    userA: string,
    userB: string,
  ): Promise<Friendship | null> {
    return this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoin('f.requester', 'requester')
      .leftJoin('f.addressee', 'addressee')
      .where(
        '(requester.id = :a AND addressee.id = :b) OR (requester.id = :b AND addressee.id = :a)',
        { a: userA, b: userB },
      )
      .getOne();
  }

  private getVisibility(privacy?: UserPrivacy): FriendProfileVisibilityDto {
    return {
      show_online_status: privacy?.show_online_status ?? true,
      show_current_activity: privacy?.show_current_activity ?? true,
      show_daily_stats: privacy?.show_daily_stats ?? true,
      show_streak: privacy?.show_streak ?? true,
      show_total_focus_time: privacy?.show_total_focus_time ?? true,
      show_on_leaderboard: privacy?.show_on_leaderboard ?? true,
    };
  }

  private buildFriendProfile(
    friend: User,
    presence?: PresenceData,
    privacy?: UserPrivacy,
    extras?: {
      streak?: { current_streak: number; longest_streak: number };
      todayFocusMinutes?: number;
      totalFocusMinutes?: number;
      leaderboardRank?: number;
    },
  ): FriendProfileDto {
    const visibility = this.getVisibility(privacy);

    const profile: FriendProfileDto = {
      id: friend.id,
      name: friend.name,
      username: friend.username ?? null,
      avatar_url: friend.avatar_url ?? null,
      visibility,
    };

    if (visibility.show_streak && extras?.streak) {
      profile.streak = extras.streak.current_streak;
      profile.longest_streak = extras.streak.longest_streak;
    }

    if (visibility.show_daily_stats && extras?.todayFocusMinutes !== undefined) {
      profile.today_focus_minutes = extras.todayFocusMinutes;
    }

    if (visibility.show_total_focus_time && extras?.totalFocusMinutes !== undefined) {
      profile.total_focus_minutes = extras.totalFocusMinutes;
    }

    if (visibility.show_on_leaderboard && extras?.leaderboardRank !== undefined) {
      profile.leaderboard_rank = extras.leaderboardRank;
    }

    if (presence && visibility.show_online_status) {
      profile.status = presence.status;
      profile.custom_status = presence.custom_status;
    }

    if (presence && visibility.show_current_activity && presence.last_seen_at) {
      profile.last_seen_at = presence.last_seen_at;
    }

    return profile;
  }

  private toPendingRequestDto(f: Friendship): PendingFriendRequestDto {
    return {
      id: f.id,
      status: f.status,
      created_at: f.created_at,
      requester: f.requester
        ? {
            id: f.requester.id,
            name: f.requester.name,
            email: f.requester.email,
            avatar_url: f.requester.avatar_url ?? null,
          }
        : undefined,
      addressee: f.addressee
        ? {
            id: f.addressee.id,
            name: f.addressee.name,
            email: f.addressee.email,
            avatar_url: f.addressee.avatar_url ?? null,
          }
        : undefined,
    };
  }

  private async ensurePrivacy(em: any, userId: string): Promise<void> {
    const has = await em.findOneBy(UserPrivacy, { user_id: userId });
    if (!has) await em.save(UserPrivacy, { user_id: userId });
  }
}
