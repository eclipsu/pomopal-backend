export class LeaderboardEntryDto {
  rank!: number;
  user_id!: string;
  name!: string;
  username!: string | null;
  avatar_url!: string | null;
  focus_minutes!: number;
}
