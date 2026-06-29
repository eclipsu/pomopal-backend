import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TestSendNotificationDto } from './dto/test-send.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  async listUsers(search?: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const q = search?.trim();

    const rows = q
      ? await this.users.find({
          where: [{ email: ILike(`%${q}%`) }, { name: ILike(`%${q}%`) }],
          select: ['id', 'email', 'name'],
          order: { email: 'ASC' },
          take,
        })
      : await this.users.find({
          select: ['id', 'email', 'name'],
          order: { email: 'ASC' },
          take,
        });

    return rows;
  }

  async testSend(dto: TestSendNotificationDto) {
    const user = await this.users.findOne({
      where: { id: dto.userId },
      select: ['id', 'email', 'name'],
    });
    if (!user) throw new NotFoundException('User not found');

    return this.notifications.sendTestNotification({
      userId: user.id,
      email: user.email,
      type: dto.type,
      templateId: dto.templateId,
      sendEmail: dto.sendEmail ?? true,
      context: {
        streak: dto.streak ?? 7,
        daysAway: dto.daysAway ?? 5,
        isLastChance: dto.isLastChance ?? false,
        completedSessions: 10,
        today: new Date().toISOString().slice(0, 10),
      },
    });
  }
}
