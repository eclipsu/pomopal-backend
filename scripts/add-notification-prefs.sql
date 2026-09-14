-- Idempotent prefs for goal + league notifications (run BEFORE deploying entity changes).
-- Usage: node scripts/apply-sql.js scripts/add-notification-prefs.sql

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS goal_updates boolean NOT NULL DEFAULT true;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS league_updates boolean NOT NULL DEFAULT true;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS daily_goal_minutes integer NOT NULL DEFAULT 25;

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON notifications (user_id, type, created_at DESC);
