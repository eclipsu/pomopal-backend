import { IsOptional, IsString, IsIn, MaxLength } from 'class-validator';

export type PresenceStatus = 'online' | 'idle' | 'offline';

export class UpdatePresenceDto {
  @IsOptional()
  @IsIn(['online', 'idle', 'offline'])
  status?: PresenceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  custom_status?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  current_activity?: string | null;
}
