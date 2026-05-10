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
import { MailService } from '../mail/mail.service';
import { PresenceService, PresenceData } from '../presence/presence.service';

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

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly presenceService: PresenceService,
    private readonly dataSource: DataSource,
  ) {}

  async sendInvite(
    requesterId: string,
    dto: SendFriendInviteDto,
  ): Promise<void> {
    console.log('sendInvite called', requesterId, dto);

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

    const [presenceMap, privacies] = await Promise.all([
      this.presenceService.getBulkPresence(friendIds),
      this.privacyRepo
        .createQueryBuilder('p')
        .where('p.user_id IN (:...ids)', { ids: friendIds })
        .getMany(),
    ]);

    const privacyMap = new Map(privacies.map((p) => [p.user_id, p]));

    return friendships
      .filter((f) => {
        const friend = f.requester?.id === userId ? f.addressee : f.requester;
        return friend !== null && friend !== undefined;
      })
      .map((f) => {
        const friend = f.requester?.id === userId ? f.addressee! : f.requester!;
        return this.buildFriendProfile(
          friend,
          presenceMap.get(friend.id),
          privacyMap.get(friend.id),
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

    const [friend, presence, privacy] = await Promise.all([
      this.userRepo.findOneByOrFail({ id: friendId }),
      this.presenceService.getPresence(friendId),
      this.privacyRepo.findOneBy({ user_id: friendId }),
    ]);

    return this.buildFriendProfile(
      friend,
      presence ?? undefined,
      privacy ?? undefined,
    );
  }

  async listPendingReceived(userId: string): Promise<Friendship[]> {
    return this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.requester', 'requester')
      .where('addressee.id = :uid', { uid: userId })
      .andWhere('f.status = :status', { status: 'pending' })
      .leftJoin('f.addressee', 'addressee')
      .orderBy('f.created_at', 'DESC')
      .getMany();
  }

  async listPendingSent(userId: string): Promise<Friendship[]> {
    return this.friendshipRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.addressee', 'addressee')
      .where('requester.id = :uid', { uid: userId })
      .andWhere('f.status = :status', { status: 'pending' })
      .leftJoin('f.requester', 'requester')
      .orderBy('f.created_at', 'DESC')
      .getMany();
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

  private buildFriendProfile(
    friend: User,
    presence?: PresenceData,
    privacy?: UserPrivacy,
  ): FriendProfileDto {
    const profile: FriendProfileDto = {
      id: friend.id,
      name: friend.name,
      avatar_url: friend.avatar_url ?? null,
    };

    const canShowStatus = privacy?.show_online_status ?? true;
    const canShowActivity = privacy?.show_current_activity ?? true;

    if (presence && canShowStatus) {
      profile.status = presence.status;
      profile.custom_status = presence.custom_status;
    }

    if (presence && canShowActivity) {
      profile.current_activity = presence.current_activity;
    }

    return profile;
  }

  private async ensurePrivacy(em: any, userId: string): Promise<void> {
    const has = await em.findOneBy(UserPrivacy, { user_id: userId });
    if (!has) await em.save(UserPrivacy, { user_id: userId });
  }
}
