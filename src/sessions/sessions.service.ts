import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateSessionDto } from './dto/createSessions.dto';
import { Repository } from 'typeorm';
import { Session } from '../entities/sessions.entity';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
  ) {}
  findAll() {
    return 'This action returns all sessions';
  }

  async findOne(id: number) {
    return await this.sessionRepo.findOne({
      where: { id },
    });
  }

  async create(dto: CreateSessionDto) {
    const session = this.sessionRepo.create({
      type: dto.type,
      planned_seconds: dto.planned_seconds,
      actual_seconds: 0,
      started_at: new Date(),
      completed: false,
    });

    return await this.sessionRepo.save(session);
  }
}
