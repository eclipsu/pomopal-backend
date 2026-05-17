import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPrivacy } from 'src/entities/user-privacy.entity';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';

@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(UserPrivacy)
    private readonly privacyRepo: Repository<UserPrivacy>,
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
    return this.privacyRepo.save(privacy);
  }
}
