import { NotificationType } from '../entities/notification.entity';

export type PrefKey =
  | 'streak_updates'
  | 'streak_nudges'
  | 'inactive_reminders'
  | 'product_announcements'
  | 'goal_updates'
  | 'league_updates';

export type NotificationPolicy = {
  pref: PrefKey;
  /** When false, create in-app only (never enqueue email). */
  email: boolean;
};

/** Central gate for prefs + email eligibility. */
export const NOTIFICATION_POLICY: Record<NotificationType, NotificationPolicy> =
  {
    announcement: { pref: 'product_announcements', email: true },
    streak_update: { pref: 'streak_updates', email: true },
    streak_at_risk: { pref: 'streak_nudges', email: true },
    streak_milestone: { pref: 'streak_updates', email: true },
    daily_nudge: { pref: 'streak_nudges', email: true },
    comeback: { pref: 'inactive_reminders', email: true },
    focus_complete: { pref: 'goal_updates', email: false },
    daily_goal: { pref: 'goal_updates', email: false },
    focus_milestone: { pref: 'goal_updates', email: true },
    weekly_rank: { pref: 'league_updates', email: true },
    rank_passed: { pref: 'league_updates', email: false },
    global_top: { pref: 'league_updates', email: true },
  };

export function policyFor(type: NotificationType): NotificationPolicy {
  return NOTIFICATION_POLICY[type];
}
