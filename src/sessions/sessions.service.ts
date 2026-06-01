import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateSessionDto } from './dto/createSessions.dto';
import { Repository } from 'typeorm';
import { Session, SessionType } from '../entities/sessions.entity';
import { SessionResponseDto } from './dto/response-dto';
import { DailyStatsService } from 'src/daily-stats/daily-stats.service';
import { StreaksService } from 'src/streaks/streaks.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { User } from 'src/entities/user.entity';
import { normalizeTimezone, toUserDate } from '../common/time';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly dailyStatsService: DailyStatsService,
    private readonly streakService: StreaksService,
    private readonly notificationsService: NotificationsService,
  ) {}

  findAll() {
    return 'This action returns all sessions';
  }

  async start(userId: string, dto: CreateSessionDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException();
    }

    const session = this.sessionRepo.create({
      user: { id: userId },
      type: dto.type,
      planned_duration_minutes: dto.planned_minutes,
      actual_duration_minutes: 0,
      started_at: new Date(),
      completed: false,
    });

    const date = toUserDate(
      session.started_at,
      normalizeTimezone(user.time_zone),
    );
    await this.streakService.update(user, date);
    return await this.sessionRepo.save(session);
  }

  async complete(userId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });

    if (!session || session.user.id !== userId) {
      throw new NotFoundException();
    }

    if (session.completed) {
      throw new BadRequestException('Session already completed');
    }

    const wallMinutes =
      (Date.now() - session.started_at.getTime()) / 60000;
    const credited = session.actual_duration_minutes ?? 0;
    const planned = session.planned_duration_minutes;
    const finished =
      wallMinutes >= planned - 0.5 || credited >= planned - 0.5;
    if (!finished) {
      throw new BadRequestException('Session not finished yet');
    }

    const previouslyAccredited = credited;
    const finalMinutes = session.planned_duration_minutes;
    const delta = finalMinutes - previouslyAccredited;

    session.completed = true;
    session.ended_at = new Date();
    session.actual_duration_minutes = finalMinutes;

    const saved = await this.sessionRepo.save(session);

    if (session.type === SessionType.POMODORO) {
      if (delta > 0) {
        await this.dailyStatsService.applyMinutes(
          session.user.id,
          session.started_at,
          normalizeTimezone(session.user.time_zone),
          delta,
          1,
        );
      }

      const streak = await this.streakService.getRecord(session.user.id);
      if (streak) {
        await this.notificationsService.onPomodoroComplete(
          session.user.id,
          streak.current_streak,
          session.user.time_zone,
          session.user.email,
        );
      }
    }

    return this.toResponse(saved);
  }

  async list(userId: string, options?: { limit?: number; offset?: number }) {
    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;
    return this.sessionRepo.find({
      where: { user: { id: userId } },
      order: { started_at: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findOne(id: string) {
    return await this.sessionRepo.findOne({ where: { id } });
  }

  async create(dto: CreateSessionDto, userId: string) {
    const session = this.sessionRepo.create({
      user: { id: userId },
      type: dto.type,
      planned_duration_minutes: dto.planned_minutes,
      actual_duration_minutes: 0,
      started_at: new Date(),
      completed: false,
    });
    return await this.sessionRepo.save(session);
  }

  async apply(userId: string, sessionId: string, elapsedSeconds?: number) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });

    if (!session || session.user.id !== userId) {
      throw new NotFoundException();
    }

    if (session.completed) {
      throw new BadRequestException('Session already completed');
    }

    const now = new Date();
    const elapsedMs =
      elapsedSeconds != null
        ? elapsedSeconds * 1000
        : now.getTime() - session.started_at.getTime();
    const newElapsedMinutes = Math.max(0, Math.ceil(elapsedMs / 60000));

    const previousMinutes = session.actual_duration_minutes ?? 0;
    const delta = newElapsedMinutes - previousMinutes;

    session.actual_duration_minutes = newElapsedMinutes;
    session.ended_at = now;
    await this.sessionRepo.save(session);

    if (session.type === SessionType.POMODORO && delta > 0) {
      await this.dailyStatsService.applyMinutes(
        session.user.id,
        session.started_at,
        normalizeTimezone(session.user.time_zone),
        delta,
      );
    }

    return session;
  }

  private toResponse(session: Session): SessionResponseDto {
    return {
      id: session.id,
      userId: session.user.id,
      type: session.type,
      planned_duration_minutes: session.planned_duration_minutes,
      actual_duration_minutes: session.actual_duration_minutes,
      started_at: session.started_at,
      ended_at: session.ended_at,
      completed: session.completed,
    };
  }
}
