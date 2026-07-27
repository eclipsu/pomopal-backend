import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';

/** ~4M bits (~512 KB). Fine for hundreds of thousands of accounts. */
const BLOOM_M = 1 << 22;
const BLOOM_K = 7;
const EMAIL_KEY = 'bloom:user:emails';
const USERNAME_KEY = 'bloom:user:usernames';

function bitPositions(value: string): number[] {
  const h1 = createHash('sha256').update(value).digest();
  const h2 = createHash('md5').update(value).digest();
  const a = h1.readUInt32BE(0);
  const b = h2.readUInt32BE(0) || 1;
  const out: number[] = [];
  for (let i = 0; i < BLOOM_K; i++) {
    out.push((a + i * b) % BLOOM_M);
  }
  return out;
}

/**
 * Redis-backed Bloom filters for fast negative lookups on email / username.
 * Positives always fall back to Postgres (false positives are possible).
 */
@Injectable()
export class UserExistenceBloomService implements OnModuleInit {
  private readonly logger = new Logger(UserExistenceBloomService.name);
  private seeded = false;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async onModuleInit() {
    try {
      await this.seedFromDatabase();
    } catch (err) {
      this.logger.warn(
        `Bloom seed skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
  }

  async addEmail(email: string): Promise<void> {
    await this.add(EMAIL_KEY, this.normalizeEmail(email));
  }

  async addUsername(username: string): Promise<void> {
    if (!username) return;
    await this.add(USERNAME_KEY, this.normalizeUsername(username));
  }

  async mightHaveEmail(email: string): Promise<boolean> {
    return this.mightContain(EMAIL_KEY, this.normalizeEmail(email));
  }

  async mightHaveUsername(username: string): Promise<boolean> {
    return this.mightContain(USERNAME_KEY, this.normalizeUsername(username));
  }

  /** Bloom + DB — definitive email taken check. */
  async isEmailTaken(email: string): Promise<boolean> {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return false;
    if (!(await this.mightHaveEmail(normalized))) return false;
    return this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalized })
      .getExists();
  }

  /** Bloom + DB — definitive username taken check. */
  async isUsernameTaken(username: string): Promise<boolean> {
    const normalized = this.normalizeUsername(username);
    if (!normalized) return false;
    if (!(await this.mightHaveUsername(normalized))) return false;
    return this.userRepo.exist({ where: { username: normalized } });
  }

  private async add(key: string, value: string): Promise<void> {
    if (!value) return;
    const pipe = this.redis.pipeline();
    for (const bit of bitPositions(value)) {
      pipe.setbit(key, bit, 1);
    }
    await pipe.exec();
  }

  private async mightContain(key: string, value: string): Promise<boolean> {
    if (!value) return false;
    const positions = bitPositions(value);
    const pipe = this.redis.pipeline();
    for (const bit of positions) {
      pipe.getbit(key, bit);
    }
    const results = await pipe.exec();
    if (!results) return true;
    return results.every(([, bit]) => Number(bit) === 1);
  }

  private async seedFromDatabase(): Promise<void> {
    if (this.seeded) return;
    const rows = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.email', 'u.username'])
      .getMany();

    const emails = rows
      .map((r) => (r.email ? this.normalizeEmail(r.email) : ''))
      .filter(Boolean);
    const usernames = rows
      .map((r) => (r.username ? this.normalizeUsername(r.username) : ''))
      .filter(Boolean);

    await this.addMany(EMAIL_KEY, emails);
    await this.addMany(USERNAME_KEY, usernames);

    this.seeded = true;
    this.logger.log(
      `Bloom seeded: ${emails.length} emails, ${usernames.length} usernames`,
    );
  }

  private async addMany(key: string, values: string[]): Promise<void> {
    if (!values.length) return;
    const pipe = this.redis.pipeline();
    for (const value of values) {
      for (const bit of bitPositions(value)) {
        pipe.setbit(key, bit, 1);
      }
    }
    await pipe.exec();
  }
}
