import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPrivacy } from 'src/entities/user-privacy.entity';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    @InjectRepository(UserPrivacy)
    private readonly privacyRepo: Repository<UserPrivacy>,
    @Inject(forwardRef(() => LeaderboardService))
    private readonly leaderboardService: LeaderboardService,
  ) {}

  async getPrivacy(userId: string): Promise<UserPrivacy> {
    const existing = await this.privacyRepo.findOneBy({ user_id: userId });
    if (existing) return existing;

    // Auto-create with all defaults on first access
    return this.privacyRepo.save(this.privacyRepo.create({ user_id: userId }));
  }

  async updatePrivacy(
    userId: string,
    dto: UpdatePrivacyDto,
  ): Promise<UserPrivacy> {
    const privacy = await this.getPrivacy(userId);
    Object.assign(privacy, dto);
    const saved = await this.privacyRepo.save(privacy);

    if (dto.show_on_leaderboard !== undefined) {
      try {
        await this.leaderboardService.updateGlobalAllTime(userId);
        await this.leaderboardService.invalidateForUser(userId);
      } catch (err) {
        this.logger.warn(
          `Leaderboard sync after privacy update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return saved;
  }
}
