import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  streak_updates?: boolean;

  @IsOptional()
  @IsBoolean()
  streak_nudges?: boolean;

  @IsOptional()
  @IsBoolean()
  inactive_reminders?: boolean;

  @IsOptional()
  @IsBoolean()
  product_announcements?: boolean;
}
