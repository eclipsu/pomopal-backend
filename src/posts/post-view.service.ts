import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { PostView } from '../entities/post-view.entity';

@Injectable()
export class PostViewService {
  constructor(
    @InjectRepository(PostView)
    private postViewRepo: Repository<PostView>,
  ) {}

  private hashIp(ip: string): string {
    return createHash('sha256')
      .update(ip + process.env.IP_SALT)
      .digest('hex');
  }

  async recordView(slug: string, ip: string): Promise<{ counted: boolean }> {
    const ipHash = this.hashIp(ip);

    try {
      await this.postViewRepo.insert({ slug, ipHash });
      return { counted: true };
    } catch {
      return { counted: false };
    }
  }

  async getCount(slug: string): Promise<number> {
    return this.postViewRepo.count({ where: { slug } });
  }

  async getCounts(slugs: string[]): Promise<Record<string, number>> {
    const rows = await this.postViewRepo
      .createQueryBuilder('v')
      .select('v.slug', 'slug')
      .addSelect('COUNT(*)', 'count')
      .where('v.slug IN (:...slugs)', { slugs })
      .groupBy('v.slug')
      .getRawMany();

    const result: Record<string, number> = {};
    slugs.forEach((s) => (result[s] = 0));
    rows.forEach((r) => (result[r.slug] = parseInt(r.count, 10)));
    return result;
  }
}
