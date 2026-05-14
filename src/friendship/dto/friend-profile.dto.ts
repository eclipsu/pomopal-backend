import { PresenceStatus } from '../../presence/dto/update-presence.dto';

export class FriendProfileDto {
  id!: string;
  name!: string;
  avatar_url!: string | null;

  status?: PresenceStatus;
  custom_status?: string | null;
  current_activity?: string | null;

  today_focus_minutes?: number;
  streak?: number;
  longest_streak?: number;
  total_focus_minutes?: number;
}
