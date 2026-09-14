import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { NotificationType } from '../../entities/notification.entity';
import { NOTIFICATION_TYPE_VALUES } from '../../entities/notification.entity';

const NOTIFICATION_TYPES = NOTIFICATION_TYPE_VALUES;

export class PreviewNotificationDto {
  @IsOptional()
  @IsEnum(NOTIFICATION_TYPES)
  type?: NotificationType;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_key?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

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
