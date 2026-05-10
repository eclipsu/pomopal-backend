import { IsOptional, IsBoolean } from 'class-validator';

export class UpdatePrivacyDto {
  @IsOptional()
  @IsBoolean()
  show_online_status?: boolean;

  @IsOptional()
  @IsBoolean()
  show_current_activity?: boolean;

  @IsOptional()
  @IsBoolean()
  show_daily_stats?: boolean;

  @IsOptional()
  @IsBoolean()
  show_streak?: boolean;

  @IsOptional()
  @IsBoolean()
  show_total_focus_time?: boolean;

  @IsOptional()
  @IsBoolean()
  show_on_leaderboard?: boolean;
}
