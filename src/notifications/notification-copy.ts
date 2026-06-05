import { NotificationType } from '../entities/notification.entity';
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;

const pick = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)];

export const APP_LINK = 'https://pomopal.lol';


export function streakAtRiskCopy(streak: number, isLastChance = false): { title: string; body: string } {
  if (isLastChance) {
    return {  
      title: `Last chance. ${streak}-day streak.`,
      body: pick([
        `You really made it ${streak} days just to lose it before midnight? ${APP_LINK}`,
        `One pomodoro right now saves your streak. That's it. ${APP_LINK}`,
        `This streak survived bad moods and lazy days. Don't let tonight end it. ${APP_LINK}`,
        `Future you is going to be really annoyed if you lose this streak tonight. ${APP_LINK}`,
        `Your streak only needs 1 minutes from you. ${APP_LINK}`,
      ] ),
    };
  }

  return {
    title: `${streak}-day streak on the line`,
    body: pick([
      `You've shown up ${streak} days in a row. Keep it alive tonight. ${APP_LINK}`,
      `Remember how hard Day 1 was? Don't restart the pain. ${APP_LINK}`,
      `You don't need motivation tonight. You just need to start. ${APP_LINK}`,
      `One small focus session now saves tomorrow's regret. ${APP_LINK}`,
      `Your streak has survived worse days than this one. ${APP_LINK}`,
    ]),
  };
}
export function streakMilestoneCopy(streak: number): { title: string; body: string } {
  return {
    title: `${streak} days in a row`,
    body: pick([
      `${streak} days ago this was just another app. Now it's part of your routine. ${APP_LINK}`,
      `Most people quit before this point. You didn't. ${APP_LINK}`,
      `${streak} straight days of showing up for yourself is actually impressive. ${APP_LINK}`,
      `At this point your streak is basically a personality trait. ${APP_LINK}`,
      `You kept going on busy days too. That's what makes this count. ${APP_LINK}`,
      `This stopped being motivation a while ago. It's just who you are now. ${APP_LINK}`,
      `A lot of people say they'll stay consistent. You actually did it. ${APP_LINK}`,
      `Your past self would be shocked you made it to ${streak} days. ${APP_LINK}`,
      `${streak} days later and you still came back today. ${APP_LINK}`,
      `Consistency looks boring until you realize how rare it is. ${APP_LINK}`,
    ]),
  };
}

export function dailyNudgeCopy(): { title: string; body: string } {
  return {
    title: `Time for a pomodoro?`,
    body: pick([
      `Your task is probably less painful than avoiding it. ${APP_LINK}`,
      `Do one pomodoro before your brain opens 14 useless tabs again. ${APP_LINK}`,
      `Starting is usually the hardest part. ${APP_LINK}`,
      `Tiny progress still counts today. ${APP_LINK}`,
      `You don't have to finish everything. Just begin. ${APP_LINK}`,
    ]),
  };
}

export function comebackCopy(daysAway: number): { title: string; body: string } {
  return {
    title: `It's been ${daysAway} days`,
    body: pick([
      `The streak is gone but you're not starting from zero — you know how to do this. ${APP_LINK}`,
      `${daysAway} days off means today feels harder than it is. Do one session anyway. ${APP_LINK}`,
      `You stopped ${daysAway} days ago for a reason. That reason probably isn't relevant anymore. ${APP_LINK}`,
    ]),
  };
}

export function focusCompleteCopy(): { title: string; body: string } {
  return {
    title: `Pomodoro complete`,
    body: pick([
      `That's the part of the day you won't regret. ${APP_LINK}`,
      `Whatever you were avoiding, you did it anyway. That counts. ${APP_LINK}`,
      `25 minutes of actual work. Most people didn't do that today. ${APP_LINK}`,
    ]),
  };
}

export function dedupeKey(type: NotificationType, userId: string, id: string): string {
  return `${type}:${userId}:${id}`;
}
