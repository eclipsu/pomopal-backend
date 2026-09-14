export type EvaluateUserJob = {
  v: 1;
  userId: string;
  email: string;
  tz: string;
  today: string;
  hour: number;
  checks: Array<
    | 'streak_at_risk'
    | 'comeback'
    | 'streak_update'
    | 'daily_nudge'
    | 'weekly_rank'
  >;
};

export type PomodoroCompletedJob = {
  v: 1;
  userId: string;
  sessionId: string;
  email: string;
  tz: string;
  today: string;
  currentStreak: number;
  creditedMinutes: number;
  allTimeMinutesBefore: number;
  weekMinutesBefore: number;
};

export type SendEmailJob = {
  v: 1;
  to: string;
  title: string;
  body: string;
  imageSource?: string;
  meta?: {
    type?: string;
    userId?: string;
    todayYmd?: string;
    showProgress?: boolean;
    showLeaderboard?: boolean;
    leaderboardRows?: Array<{
      rank: number;
      name: string;
      minutes: number;
      isYou?: boolean;
      gapBefore?: boolean;
    }>;
  };
};
