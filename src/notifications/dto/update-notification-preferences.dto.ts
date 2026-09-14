import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsOptional()
  @IsBoolean()
  goal_updates?: boolean;

  @IsOptional()
  @IsBoolean()
  league_updates?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(600)
  daily_goal_minutes?: number;
}
