/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { TimezoneDto } from './dto/update-timezone.dto';
import { UpdateUserSettingsDto } from './dto/update-settings.dto';
import type { UserRole } from 'src/entities/user.entity';
import {
  isAllocatableUsername,
  isReservedUsername,
  isValidUsername,
  firstNameUsername,
  slugifyUsername,
} from 'src/common/username.util';
import { StorageService } from 'src/storage/storage.service';
import { UserExistenceBloomService } from './user-existence-bloom.service';

function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly storage: StorageService,
    private readonly bloom: UserExistenceBloomService,
  ) {}

  async onModuleInit() {
    const emails = [...parseAdminEmails()];
    if (emails.length) {
      await this.userRepo
        .createQueryBuilder()
        .update(User)
        .set({ role: 'admin' })
        .where('LOWER(email) IN (:...emails)', { emails })
        .andWhere("role != 'admin'")
        .execute();
    }
    await this.backfillMissingUsernames();
  }

  private async backfillMissingUsernames() {
    const missing = await this.userRepo
      .createQueryBuilder('u')
      .where('u.username IS NULL OR u.username = :empty', { empty: '' })
      .getMany();
    for (const user of missing) {
      const username = await this.allocateUsername(user.name || user.email);
      await this.userRepo.update({ id: user.id }, { username });
      await this.bloom.addUsername(username);
    }
  }

  async allocateUsername(seed: string): Promise<string> {
    let base = firstNameUsername(seed.split('@')[0] || 'pomopal');
    if (base.length < 3) base = 'pomo';
    if (!isValidUsername(base) && !isAllocatableUsername(base)) {
      base = `pomo${randomBytes(2).toString('hex').replace(/[^a-z]/gi, '').toLowerCase() || 'x'}`.slice(0, 32);
      if (base.length < 3) base = 'pomopal';
    }
    for (let i = 0; i < 40; i++) {
      const candidate =
        i === 0 ? base : `${base.slice(0, 28)}${i + 1}`.slice(0, 32);
      if (!isAllocatableUsername(candidate) && !isValidUsername(candidate)) {
        continue;
      }
      if (isReservedUsername(candidate)) continue;
      const taken = await this.bloom.isUsernameTaken(candidate);
      if (!taken) return candidate;
    }
    return `pomo${randomBytes(4).toString('hex').replace(/\d/g, 'a').slice(0, 8)}`;
  }

  async create(createUserDto: CreateUserDto) {
    const { password, timezone, username: rawUsername, ...rest } =
      createUserDto;
    const email = this.bloom.normalizeEmail(rest.email);
    if (!email) throw new BadRequestException('Email is required');

    if (await this.bloom.isEmailTaken(email)) {
      throw new ConflictException('Email already registered');
    }

    const secret = password?.trim() || randomBytes(32).toString('hex');
    const password_hash = await bcrypt.hash(secret, 12);

    let username: string;
    if (rawUsername?.trim()) {
      username = slugifyUsername(rawUsername);
      if (!isValidUsername(username)) {
        throw new BadRequestException(
          'Username must be your first name in lowercase letters (3–32 chars)',
        );
      }
      if (await this.bloom.isUsernameTaken(username)) {
        throw new ConflictException('Username taken');
      }
    } else {
      username = await this.allocateUsername(rest.name || email);
    }

    const user = this.userRepo.create({
      ...rest,
      email,
      username,
      time_zone: timezone?.trim() || 'UTC',
      password_hash,
      role: parseAdminEmails().has(email) ? 'admin' : 'user',
    });

    try {
      const saved = await this.userRepo.save(user);
      await this.bloom.addEmail(email);
      await this.bloom.addUsername(username);
      return saved;
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      if (code === '23505') {
        throw new ConflictException('Email or username already registered');
      }
      throw err;
    }
  }

  async syncAdminRole(user: { id: string; email: string; role: UserRole }) {
    if (!parseAdminEmails().has(user.email.toLowerCase())) return user;
    if (user.role === 'admin') return user;
    await this.userRepo.update({ id: user.id }, { role: 'admin' });
    return { ...user, role: 'admin' as const };
  }

  findAll() {
    return `This action returns all user`;
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });

    if (!user) throw new NotFoundException('User not found');

    if (!user.username) {
      const username = await this.allocateUsername(user.name || user.email);
      await this.userRepo.update({ id }, { username });
      await this.bloom.addUsername(username);
      user.username = username;
    }

    const withRole = await this.syncAdminRole(user);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safeUser } = user;

    return { ...safeUser, role: withRole.role ?? 'user' };
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = this.bloom.normalizeEmail(email);
    if (!normalized) return null;
    return await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalized })
      .getOne();
  }

  async findByUsername(username: string): Promise<User | null> {
    return await this.userRepo.findOne({
      where: { username: username.toLowerCase() },
    });
  }

  async isEmailAvailable(email: string): Promise<boolean> {
    return !(await this.bloom.isEmailTaken(email));
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    const slug = slugifyUsername(username);
    if (!isValidUsername(slug) && !isAllocatableUsername(slug)) return false;
    if (isReservedUsername(slug)) return false;
    return !(await this.bloom.isUsernameTaken(slug));
  }

  /** Guarantee a public username exists; returns the handle. */
  async ensureUsername(userId: string, seed?: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.username) return user.username;
    const username = await this.allocateUsername(
      seed || user.name || user.email,
    );
    await this.userRepo.update({ id: userId }, { username });
    await this.bloom.addUsername(username);
    return username;
  }

  async updateUsername(id: string, raw: string) {
    const username = slugifyUsername(raw);
    if (!isValidUsername(username)) {
      throw new BadRequestException(
        'Username must be your first name in lowercase letters (3–32 chars)',
      );
    }
    if (await this.bloom.isUsernameTaken(username)) {
      const owner = await this.userRepo.findOne({ where: { username } });
      if (owner?.id !== id) throw new ConflictException('Username taken');
    }
    await this.userRepo.update({ id }, { username });
    await this.bloom.addUsername(username);
    return this.findOne(id);
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const key = await this.storage.saveUserAvatar(file);
    const avatarUrl = this.storage.objectPublicUrl(key);
    const previous = user.avatar_url;

    await this.userRepo.update({ id: userId }, { avatar_url: avatarUrl });

    if (previous && this.storage.isManagedAvatarUrl(previous)) {
      await this.storage.deleteStoredImage(previous);
    }

    return this.findOne(userId);
  }

  async updateTimezone(id: string, dto: TimezoneDto) {
    const user = await this.userRepo.findOne({ where: { id } });

    if (!user) throw new NotFoundException('User not found');

    await this.userRepo.update({ id }, { time_zone: dto.time_zone });

    return { message: 'Timezone updated successfully' };
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }

  async updatePreferences(id: string, dto: UpdateUserSettingsDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const patch: Partial<User> = {};
    if (dto.pomodoro_minutes != null)
      patch.pomodoro_minutes = dto.pomodoro_minutes;
    if (dto.short_break_minutes != null)
      patch.short_break_minutes = dto.short_break_minutes;
    if (dto.long_break_minutes != null)
      patch.long_break_minutes = dto.long_break_minutes;

    if (Object.keys(patch).length) {
      await this.userRepo.update({ id }, patch);
    }

    return this.findOne(id);
  }
}
