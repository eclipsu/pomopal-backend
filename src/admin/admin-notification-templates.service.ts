import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { StorageService } from '../storage/storage.service';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notification-template.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AdminNotificationTemplatesService {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templates: Repository<NotificationTemplate>,
    private readonly storage: StorageService,
  ) {}

  findAll() {
    return this.templates
      .find({ order: { updated_at: 'DESC' } })
      .then((rows) => Promise.all(rows.map((t) => this.withResolvedImage(t))));
  }

  async findOne(id: string) {
    const template = await this.templates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return this.withResolvedImage(template);
  }

  async listImages(): Promise<{ key: string; url: string }[]> {
    const fromS3 = await this.storage.listS3TemplateKeys();
    const fromDb = await this.templates
      .createQueryBuilder('t')
      .select('DISTINCT t.image_url', 'image_url')
      .where('t.image_url IS NOT NULL')
      .getRawMany<{ image_url: string }>();

    const keys = new Set<string>();
    for (const key of fromS3) keys.add(key);
    for (const row of fromDb) {
      const key = this.storage.resolveKeyForReuse(row.image_url);
      if (key) keys.add(key);
    }

    const sorted = [...keys].sort((a, b) => b.localeCompare(a));
    return sorted.map((key) => ({
      key,
      url: this.storage.objectPublicUrl(key),
    }));
  }

  private async withResolvedImage(template: NotificationTemplate) {
    if (!template.image_url) return template;
    const url = await this.storage.resolveImageUrl(template.image_url);
    if (!url) return template;
    const v = new Date(template.updated_at).getTime();
    const sep = url.includes('?') ? '&' : '?';
    return { ...template, image_url: `${url}${sep}v=${v}` };
  }

  private async resolveReusedImageKey(
    imageKey: string | undefined,
  ): Promise<string | null> {
    if (!imageKey?.trim()) return null;
    if (!this.storage.isValidTemplateImageKey(imageKey)) {
      throw new BadRequestException('Invalid image key');
    }
    if (!(await this.storage.imageExists(imageKey))) {
      throw new NotFoundException('Image not found in storage');
    }
    return imageKey;
  }

  private async deleteStoredImageIfUnused(
    stored: string | null | undefined,
    exceptTemplateId?: string,
  ): Promise<void> {
    const key = this.storage.resolveKeyForReuse(stored);
    if (!key) return;

    const qb = this.templates
      .createQueryBuilder('t')
      .where('t.image_url = :key', { key });

    if (exceptTemplateId) {
      qb.andWhere('t.id != :id', { id: exceptTemplateId });
    }

    const refs = await qb.getCount();
    if (refs === 0) {
      await this.storage.deleteStoredImage(key);
    }
  }

  async uploadImage(file?: Express.Multer.File): Promise<{ key: string; url: string }> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const key = await this.storage.saveTemplateImage(file);
    return { key, url: this.storage.objectPublicUrl(key) };
  }

  async create(dto: CreateNotificationTemplateDto) {
    const id = randomUUID();
    let image_url: string | null = null;

    if (dto.image_key) {
      image_url = await this.resolveReusedImageKey(dto.image_key);
    }

    const template = this.templates.create({
      id,
      name: dto.name,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      eligibility_rules: dto.eligibility_rules ?? {},
      active: dto.active ?? true,
      image_url,
    });

    return this.withResolvedImage(await this.templates.save(template));
  }

  async update(id: string, dto: UpdateNotificationTemplateDto) {
    const template = await this.templates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');

    const previousKey = template.image_url;

    if (dto.image_key !== undefined) {
      if (dto.image_key === '') {
        template.image_url = null;
      } else {
        template.image_url = await this.resolveReusedImageKey(dto.image_key);
      }
    }

    Object.assign(template, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.body !== undefined && { body: dto.body }),
      ...(dto.eligibility_rules !== undefined && {
        eligibility_rules: dto.eligibility_rules,
      }),
      ...(dto.active !== undefined && { active: dto.active }),
    });

    const saved = await this.templates.save(template);

    if (previousKey && previousKey !== saved.image_url) {
      await this.deleteStoredImageIfUnused(previousKey, id);
    }

    return this.withResolvedImage(saved);
  }

  async remove(id: string) {
    const template = await this.templates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');

    const imageKey = template.image_url;
    await this.templates.remove(template);
    await this.deleteStoredImageIfUnused(imageKey);

    return { deleted: true };
  }
}
