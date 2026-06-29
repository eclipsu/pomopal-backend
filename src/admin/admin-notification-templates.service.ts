import { Injectable, NotFoundException } from '@nestjs/common';
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
    return this.templates.find({ order: { updated_at: 'DESC' } });
  }

  async findOne(id: string) {
    const template = await this.templates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async create(
    dto: CreateNotificationTemplateDto,
    image?: Express.Multer.File,
  ) {
    const id = randomUUID();
    let image_url: string | null = null;
    if (image) {
      image_url = await this.storage.saveTemplateImage(image, id);
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

    return this.templates.save(template);
  }

  async update(
    id: string,
    dto: UpdateNotificationTemplateDto,
    image?: Express.Multer.File,
  ) {
    const template = await this.findOne(id);

    if (image) {
      await this.storage.deleteByUrl(template.image_url);
      template.image_url = await this.storage.saveTemplateImage(image, id);
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

    return this.templates.save(template);
  }

  async remove(id: string) {
    const template = await this.findOne(id);
    await this.storage.deleteByUrl(template.image_url);
    await this.templates.remove(template);
    return { deleted: true };
  }
}
