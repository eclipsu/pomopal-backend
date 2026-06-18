import { NotificationType } from '../entities/notification.entity';
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;

const pick = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)];

export const APP_LINK = 'https://pomopal.lol';

export function streakAtRiskCopy(
  streak: number,
  isLastChance = false,
): { title: string } {
  if (isLastChance) {
    return {
      title: pick([
        `BROOOOOOOO! It's 11 PM. Your ${streak}-day streak is not doing okay.`,
        `Your ${streak} day streak is dying, it will haunt you forever btw`,
        `Your ${streak} day streak just called me. It's sad because you abandoned it.`,
        `Are we in the mood to start a new streak?`,
      ]),
    };
  }

  return {
    title: pick([
      `${streak} day streak dying, it will haunt you forever btw`,
      `Who's going to carry the books and the ${streak} day streak, son?`,
      `Tell yourself the truth! That you've wasted enough time... so your ${streak} day streak doesn't die, ok?`,
      `My greatest pain in life is that ${streak} day streak will never be able to see it become a ${streak + 1} day streak.`,
    ]),
  };
}

export function streakMilestoneCopy(streak: number): { title: string } {
  return {
    title: pick([
      `${streak} days. Nobody is going to say it so I will: you're built different.`,
      `${streak} days in a row. Name one person in your life who would do that. I'll wait.`,
      `${streak} days and you're still here. I'm not crying, you're crying.`,
      `${streak} days. Ye would be proud. Actually he'd say he did it first but still.`,
    ]),
  };
}

export function dailyNudgeCopy(): { title: string } {
  return {
    title: pick([
      `YEAH BUDDY, KEEP SCROLLING 😂.`,
      `Stay hard. Or don't. But mostly stay hard. 👃`,
      `Your future self has a six pack and a ${APP_LINK} streak. Just saying.`,
      `Nobody is coming to save you. Except me. Hi.`,
    ]),
  };
}

export function comebackCopy(daysAway: number): { title: string } {
  return {
    title: pick([
      `PLEASE COMEBACKKK 😭😭😭`,
      `You ghosted PomoPal for ${daysAway} days... please come back.`,
      `Psst- hey! Come back, I'll buy you a beer if you do.`,
    ]),
  };
}

export function focusCompleteCopy(): { title: string } {
  return {
    title: pick([
      `W. That's it. Just W. 🫠`,
      `You did a pomodoro and didn't die. Growth. 💪`,
      `Entire session of not being a coward. Respect. 👍`,
    ]),
  };
}

export function dedupeKey(
  type: NotificationType,
  userId: string,
  id: string,
): string {
  return `${type}:${userId}:${id}`;
}