/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TimezoneDto } from './dto/update-timezone.dto';
import { UpdateUserSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {}
  async create(createUserDto: CreateUserDto) {
    const { password, ...rest } = createUserDto;
    const hashed_password = await bcrypt.hash(password, 12);
    const user = this.userRepo.create({
      ...rest,
      password_hash: hashed_password,
    });

    return await this.userRepo.save(user);
  }

  findAll() {
    return `This action returns all user`;
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });

    if (!user) throw new NotFoundException('User not found');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safeUser } = user;

    return safeUser;
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
