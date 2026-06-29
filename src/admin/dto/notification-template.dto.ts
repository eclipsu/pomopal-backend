import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { NotificationType } from '../../entities/notification.entity';

const NOTIFICATION_TYPES = [
  'announcement',
  'streak_at_risk',
  'streak_milestone',
  'daily_nudge',
  'comeback',
  'focus_complete',
] as const satisfies readonly NotificationType[];

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
}

export class CreateNotificationTemplateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(NOTIFICATION_TYPES)
  type!: NotificationType;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @Transform(({ value }) => parseJsonObject(value))
  @IsObject()
  eligibility_rules?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value, true))
  @IsBoolean()
  active?: boolean;
}

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(NOTIFICATION_TYPES)
  type?: NotificationType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @Transform(({ value }) => parseJsonObject(value))
  @IsObject()
  eligibility_rules?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value, true))
  @IsBoolean()
  active?: boolean;
}
