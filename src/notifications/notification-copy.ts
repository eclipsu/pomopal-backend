import { NotificationType } from '../entities/notification.entity';

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;

const pick = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)];

export function streakAtRiskCopy(streak: number): { title: string; body: string } {
  return {
    title: `${streak}-day streak on the line`,
    body: pick([
      `One pomodoro saves your ${streak}-day streak. Start a focus session now.`,
      `Your ${streak}-day streak ends if you skip today. A single pomodoro keeps it alive.`,
      `${streak} days strong — don't stop now. One focus session is enough.`,
    ]),
  };
}

export function streakMilestoneCopy(streak: number): { title: string; body: string } {
  return {
    title: `${streak}-day streak!`,
    body: pick([
      `${streak} days in a row. That's real focus momentum.`,
      `You hit ${streak} days straight. Keep the pomodoros coming.`,
      `${streak}-day streak unlocked. Nice work.`,
    ]),
  };
}

export function dailyNudgeCopy(): { title: string; body: string } {
  return {
    title: 'Time for a pomodoro?',
    body: pick([
      'Good time to start a focus session.',
      'Your brain called — it wants a pomodoro.',
      'Ready when you are. One session goes a long way.',
    ]),
  };
}

export function comebackCopy(daysAway: number): { title: string; body: string } {
  return {
    title: 'The tomato missed you',
    body: pick([
      `It's been ${daysAway} days. Start with one pomodoro today.`,
      `${daysAway} days away — ease back in with a single focus session.`,
      `Welcome back whenever you're ready. One pomodoro is a great start.`,
    ]),
  };
}

export function focusCompleteCopy(): { title: string; body: string } {
  return {
    title: 'Pomodoro complete',
    body: pick([
      'Nice — one more session in the books.',
      'Focus session done. Take a break, you earned it.',
      'Another pomodoro crushed.',
    ]),
  };
}

export function dedupeKey(
  type: NotificationType,
  userId: string,
  suffix: string,
): string {
  return `${type}:${userId}:${suffix}`;
}
