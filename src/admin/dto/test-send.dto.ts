import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
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
