import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateSessionDto } from './dto/createSessions.dto';
import { Repository } from 'typeorm';
import { Session } from '../entities/sessions.entity';
import { SessionResponseDto } from './dto/response-dto';
import { DailyStatsService } from 'src/daily-stats/daily-stats.service';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
    private readonly dailyStatsService: DailyStatsService,
  ) {}
  findAll() {
    return 'This action returns all sessions';
  }

  // this is to start a session
  async start(userId: string, dto: CreateSessionDto) {
    const session = this.sessionRepo.create({
      user: { id: userId },
      type: dto.type,
      planned_duration_minutes: dto.planned_minutes,
      started_at: new Date(),
      completed: false,
    });
    return await this.sessionRepo.save(session);
  }

  // mark a session complete
  async complete(userId, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });

    if (!session || session.user.id !== userId) {
      throw new NotFoundException();
    }

    if (session.completed)
      throw new BadRequestException('Session already completed');

    const elapsedMinutes = (Date.now() - session.started_at.getTime()) / 60000;
    if (elapsedMinutes < session.planned_duration_minutes) {
      throw new BadRequestException('Session not finished yet');
    }

    session.completed = true;
    session.actual_duration_minutes = session.planned_duration_minutes;
    session.ended_at = new Date();

    await this.dailyStatsService.applySession(session, session.user.time_zone);
    return this.toResponse(await this.sessionRepo.save(session));
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
    return await this.sessionRepo.findOne({
      where: { id },
    });
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
