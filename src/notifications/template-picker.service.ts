import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { NotificationType } from '../entities/notification.entity';
import { isTemplateEligible } from './template-eligibility';

@Injectable()
export class TemplatePickerService {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templates: Repository<NotificationTemplate>,
  ) {}

  async hasActiveTemplates(type: NotificationType): Promise<boolean> {
    const count = await this.templates.count({ where: { type, active: true } });
    return count > 0;
  }

  async pickTemplate(
    type: NotificationType,
    context: Record<string, unknown>,
  ): Promise<NotificationTemplate | null> {
    const candidates = await this.templates.find({
      where: { type, active: true },
    });
    const eligible = candidates.filter((t) => isTemplateEligible(t, context));
    if (!eligible.length) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }
}
