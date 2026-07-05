/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { TimezoneDto } from './dto/update-timezone.dto';
import { UpdateUserSettingsDto } from './dto/update-settings.dto';
import type { UserRole } from 'src/entities/user.entity';

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
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {}

  async onModuleInit() {
    const emails = [...parseAdminEmails()];
    if (!emails.length) return;
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ role: 'admin' })
      .where('LOWER(email) IN (:...emails)', { emails })
      .andWhere("role != 'admin'")
      .execute();
  }
  async create(createUserDto: CreateUserDto) {
    const { password, timezone, ...rest } = createUserDto;
    const secret = password?.trim() || randomBytes(32).toString('hex');
    const password_hash = await bcrypt.hash(secret, 12);
    const user = this.userRepo.create({
      ...rest,
      time_zone: timezone?.trim() || 'UTC',
      password_hash,
      role: parseAdminEmails().has(rest.email.toLowerCase()) ? 'admin' : 'user',
    });

    return await this.userRepo.save(user);
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

    const withRole = await this.syncAdminRole(user);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safeUser } = user;

    return { ...safeUser, role: withRole.role ?? 'user' };
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepo.findOne({ where: { email } });
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

    await this.userRepo.update(
      { id },
      {
        ...(dto.pomodoro_minutes && { pomodoro_minutes: dto.pomodoro_minutes }),
        ...(dto.short_break_minutes && {
          short_break_minutes: dto.short_break_minutes,
        }),
        ...(dto.long_break_minutes && {
          long_break_minutes: dto.long_break_minutes,
        }),
      },
    );

    return this.findOne(id);
  }
}
