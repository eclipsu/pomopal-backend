import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { NotificationType } from '../../entities/notification.entity';
import { NOTIFICATION_TYPE_VALUES } from '../../entities/notification.entity';

const NOTIFICATION_TYPES = NOTIFICATION_TYPE_VALUES;

export class TestSendNotificationDto {
  @IsUUID()
  userId!: string;

  @IsEnum(NOTIFICATION_TYPES)
  type!: NotificationType;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  streak?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  daysAway?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isLastChance?: boolean;
}
