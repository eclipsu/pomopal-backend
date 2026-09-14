import { NotificationType } from '../entities/notification.entity';
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;

const pick = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)];

export const APP_LINK = 'https://pomopal.lol';

export function streakUpdateCopy(streak: number): { title: string; body: string } {
  return {
    title: 'Keep your streak going?',
    body: pick([
      `Your streak is on grace — one pomodoro today keeps it alive.`,
      `You're at ${streak} days. One pomodoro today keeps the fire going.`,
      `${streak}-day streak on grace. Don't let today be the miss.`,
    ]),
  };
}

export function streakAtRiskCopy(
  streak: number,
  isLastChance = false,
): { title: string; body: string } {
  if (isLastChance) {
    return {
      title: 'Keep your streak going?',
      body: pick([
        `BROOOOOOOO! It's 11 PM on your last grace day. Your ${streak}-day streak is not doing okay.`,
        `Your ${streak} day streak is dying — tonight is the last chance to save it.`,
        `Your ${streak} day streak just called me. It's sad because you abandoned it.`,
        `Last grace day. Are we in the mood to start a new streak, or keep this ${streak}-day one?`,
      ]),
    };
  }

  return {
    title: 'Keep your streak going?',
    body: pick([
      `${streak} day streak on grace — you've got a couple days. Don't waste them.`,
      `Who's going to carry the books and the ${streak} day streak, son?`,
      `Tell yourself the truth! That you've wasted enough time... so your ${streak} day streak doesn't die, ok?`,
      `My greatest pain in life is that ${streak} day streak will never be able to see it become a ${streak + 1} day streak.`,
    ]),
  };
}

export function streakMilestoneCopy(streak: number): { title: string; body: string } {
  return {
    title: 'Streak Milestone',
    body: pick([
      `${streak} days. Nobody is going to say it so I will: you're built different.`,
      `${streak} days in a row. Name one person in your life who would do that. I'll wait.`,
      `${streak} days and you're still here. I'm not crying, you're crying.`,
      `${streak} days. Ye would be proud. Actually he'd say he did it first but still.`,
    ]),
  };
}

export function dailyNudgeCopy(): { title: string; body: string } {
  return {
    title: 'Daily Nudge',
    body: pick([
      `YEAH BUDDY, KEEP SCROLLING 😂.`,
      `Stay hard. Or don't. But mostly stay hard. 👃`,
      `Your future self has a six pack and a ${APP_LINK} streak. Just saying.`,
      `Nobody is coming to save you. Except me. Hi.`,
    ]),
  };
}

export function comebackCopy(daysAway: number): { title: string; body: string } {
  return {
    title: 'Comeback',
    body: pick([
      `PLEASE COMEBACKKK 😭😭😭`,
      `You ghosted PomoPal for ${daysAway} days... please come back.`,
      `Psst- hey! Come back, I'll buy you a beer if you do.`,
    ]),
  };
}

export function focusCompleteCopy(): { title: string; body: string } {
  return {
    title: 'Focus Complete',
    body: pick([
      `W. That's it. Just W. 🫠`,
      `You did a pomodoro and didn't die. Growth. 💪`,
      `Entire session of not being a coward. Respect. 👍`,
    ]),
  };
}

export function dailyGoalCopy(
  minutes: number,
  goal: number,
): { title: string; body: string } {
  return {
    title: 'Daily goal cleared',
    body: pick([
      `${minutes}/${goal} minutes. That's the bar. You cleared it.`,
      `Daily goal: done. ${minutes} minutes in the bank.`,
      `Goal hit (${goal} min). Tomorrow's you owes you one.`,
    ]),
  };
}

export function focusMilestoneCopy(
  totalMinutes: number,
): { title: string; body: string } {
  const hours = Math.round(totalMinutes / 60);
  return {
    title: 'Focus milestone',
    body: pick([
      `${totalMinutes} lifetime minutes (~${hours}h). That's real volume.`,
      `You crossed ${totalMinutes} minutes all-time. Keep stacking.`,
      `${totalMinutes} minutes focused. The tomato is proud.`,
    ]),
  };
}

export function weeklyRankCopy(args: {
  weekMinutes: number;
  weekSessions: number;
  rank?: number | null;
}): { title: string; body: string } {
  const { weekMinutes, weekSessions, rank } = args;
  const rankBit =
    rank != null ? ` Global week rank: #${rank}.` : '';
  return {
    title: 'Your week in focus',
    body: pick([
      `${weekMinutes} minutes across ${weekSessions} sessions.${rankBit}`,
      `Week closed: ${weekMinutes} focused minutes.${rankBit}`,
      `${weekSessions} sessions, ${weekMinutes} minutes. That's a week.${rankBit}`,
    ]),
  };
}

export function rankPassedCopy(args: {
  otherName: string;
  direction: 'passed_you' | 'you_passed';
  minutes: number;
}): { title: string; body: string } {
  const { otherName, direction, minutes } = args;
  if (direction === 'you_passed') {
    return {
      title: 'You moved up',
      body: `You just passed ${otherName} on this week's leaderboard (${minutes} min).`,
    };
  }
  return {
    title: 'Someone passed you',
    body: `${otherName} just passed you on this week's leaderboard (${minutes} min).`,
  };
}

export function globalTopCopy(rank: number): { title: string; body: string } {
  return {
    title: 'Global top 5',
    body: pick([
      `You're #${rank} on the global weekly leaderboard. Defend it.`,
      `Top 5. Rank #${rank}. The board sees you.`,
      `#${rank} worldwide this week. One more pomodoro keeps you there.`,
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
