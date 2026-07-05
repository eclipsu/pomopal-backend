import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { NotificationTemplateImage } from '../entities/notification-template-image.entity';
import type { NotificationType } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { StorageService } from '../storage/storage.service';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notification-template.dto';
import {
  defaultNameFromKey,
  displayNameFromFile,
  sanitizeDisplayName,
} from './image-library.util';
import { randomUUID } from 'crypto';

export interface LibraryImageDto {
  key: string;
  url: string;
  name: string;
}

@Injectable()
export class AdminNotificationTemplatesService {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templates: Repository<NotificationTemplate>,
    @InjectRepository(NotificationTemplateImage)
    private readonly imageLibrary: Repository<NotificationTemplateImage>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly storage: StorageService,
  ) {}

  findAll(type?: NotificationType) {
    const where = type ? { type } : {};
    return this.templates
      .find({ where, order: { updated_at: 'DESC' } })
      .then((rows) => Promise.all(rows.map((t) => this.withResolvedImage(t))));
  }

  async findOne(id: string) {
    const template = await this.templates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return this.withResolvedImage(template);
  }

  async listImages(): Promise<LibraryImageDto[]> {
    const fromLibrary = await this.imageLibrary.find({
      order: { created_at: 'DESC' },
    });

    const unnamed = fromLibrary.filter((row) => !row.display_name?.trim());
    if (unnamed.length) {
      for (const row of unnamed) {
        row.display_name = defaultNameFromKey(row.key);
      }
      await this.imageLibrary.save(unnamed);
    }

    const fromS3 = await this.storage.listS3TemplateKeys();
    const fromDb = await this.templates
      .createQueryBuilder('t')
      .select('DISTINCT t.image_url', 'image_url')
      .where('t.image_url IS NOT NULL')
      .getRawMany<{ image_url: string }>();

    const libraryByKey = new Map(fromLibrary.map((row) => [row.key, row]));

    const keys = new Set<string>();
    for (const row of fromLibrary) keys.add(row.key);
    for (const key of fromS3) keys.add(key);
    for (const row of fromDb) {
      const key = this.storage.resolveKeyForReuse(row.image_url);
      if (key) keys.add(key);
    }

    const missingKeys = [...keys].filter((key) => !libraryByKey.has(key));
    if (missingKeys.length) {
      const backfilled = await this.imageLibrary.save(
        missingKeys.map((key) =>
          this.imageLibrary.create({
            key,
            display_name: defaultNameFromKey(key),
            created_by_email: null,
          }),
        ),
      );
      for (const row of backfilled) {
        libraryByKey.set(row.key, row);
      }
    }

    const sorted = [...keys].sort((a, b) => {
      const aRow = libraryByKey.get(a);
      const bRow = libraryByKey.get(b);
      const aTime = aRow?.created_at.getTime() ?? 0;
      const bTime = bRow?.created_at.getTime() ?? 0;
      if (aTime !== bTime) return bTime - aTime;
      const aName = aRow?.display_name ?? a;
      const bName = bRow?.display_name ?? b;
      return aName.localeCompare(bName);
    });

    return sorted.map((key) => this.toLibraryImageDto(key, libraryByKey.get(key)));
  }

  async renameImage(key: string, name: string): Promise<LibraryImageDto> {
    if (!this.storage.isValidTemplateImageKey(key)) {
      throw new BadRequestException('Invalid image key');
    }
    if (!(await this.storage.imageExists(key))) {
      throw new NotFoundException('Image not found in storage');
    }

    let display_name: string;
    try {
      display_name = sanitizeDisplayName(name);
    } catch {
      throw new BadRequestException('Display name is required');
    }

    let row = await this.imageLibrary.findOne({ where: { key } });
    if (!row) {
      row = await this.imageLibrary.save(
        this.imageLibrary.create({
          key,
          display_name,
          created_by_email: null,
        }),
      );
    } else {
      row.display_name = display_name;
      row = await this.imageLibrary.save(row);
    }

    return this.toLibraryImageDto(key, row);
  }

  private toLibraryImageDto(
    key: string,
    row?: NotificationTemplateImage,
  ): LibraryImageDto {
    const base = this.storage.objectPublicUrl(key);
    const v = row?.created_at.getTime();
    return {
      key,
      name: row?.display_name ?? defaultNameFromKey(key),
      url: v ? `${base}?v=${v}` : base,
    };
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
    if (refs > 0) return;

    const inLibrary = await this.imageLibrary.exists({ where: { key } });
    if (inLibrary) return;

    await this.storage.deleteStoredImage(key);
  }

  async uploadImage(
    file?: Express.Multer.File,
    adminUserId?: string,
    requestedName?: string,
  ): Promise<LibraryImageDto> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const key = await this.storage.saveTemplateImage(file);

    let display_name: string;
    try {
      display_name = requestedName?.trim()
        ? sanitizeDisplayName(requestedName)
        : displayNameFromFile(file);
    } catch {
      throw new BadRequestException('Invalid image name');
    }

    let created_by_email: string | null = null;
    if (adminUserId) {
      const admin = await this.users.findOne({
        where: { id: adminUserId },
        select: ['email'],
      });
      created_by_email = admin?.email ?? null;
    }

    const saved = await this.imageLibrary.save(
      this.imageLibrary.create({ key, display_name, created_by_email }),
    );

    return this.toLibraryImageDto(key, saved);
  }

  async create(dto: CreateNotificationTemplateDto, adminUserId?: string) {
    const id = randomUUID();
    let image_url: string | null = null;

    if (dto.image_key) {
      image_url = await this.resolveReusedImageKey(dto.image_key);
    }

    let created_by_email: string | null = null;
    if (adminUserId) {
      const admin = await this.users.findOne({
        where: { id: adminUserId },
        select: ['email'],
      });
      created_by_email = admin?.email ?? null;
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
      created_by_email,
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
