import { PresenceStatus } from '../../presence/dto/update-presence.dto';
import { FriendProfileVisibilityDto } from './friend-profile-visibility.dto';

export class FriendProfileDto {
  id!: string;
  name!: string;
  username!: string | null;
  avatar_url!: string | null;

  status?: PresenceStatus;
  custom_status?: string | null;
  current_activity?: string | null;
  last_seen_at?: string | null;

  today_focus_minutes?: number;
  streak?: number;
  longest_streak?: number;
  total_focus_minutes?: number;
  leaderboard_rank?: number;

  /** What this friend allows others to see — drives “Private” labels in the UI */
  visibility!: FriendProfileVisibilityDto;
}
