import { NotificationType } from '../entities/notification.entity';
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;

const pick = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)];

export const APP_LINK = 'https://pomopal.lol';

export function streakAtRiskCopy(
  streak: number,
  isLastChance = false,
): { title: string; body: string } {
  if (isLastChance) {
    return {
      title: `Last chance. ${streak} days. Don't you dare.`,
      body: pick([
        `You survived ${streak} days and you're gonna blow it before midnight?? Come on. ${APP_LINK}`,
        `One pomodoro. That's literally all I'm asking. One. ${APP_LINK}`,
        `This streak has seen bad days, lazy days, "I'll do it later" days. Don't let tonight be the one that kills it. ${APP_LINK}`,
        `Future you WILL be annoyed about this. I'm giving you the chance to not be that person. ${APP_LINK}`,
        `Your streak needs like 25 minutes. You've spent longer looking for what to watch. ${APP_LINK}`,
      ]),
    };
  }

  return {
    title: `Your ${streak}-day streak is getting nervous`,
    body: pick([
      `${streak} days straight and you're thinking about skipping tonight? Bold. ${APP_LINK}`,
      `Remember day 1? Yeah. Don't make yourself do that again. ${APP_LINK}`,
      `You don't need to feel like it. You just need to start. Big difference. ${APP_LINK}`,
      `One session now or regret later. Pretty easy math tbh. ${APP_LINK}`,
      `Your streak has outlasted worse moods than whatever you've got going on right now. ${APP_LINK}`,
    ]),
  };
}

export function streakMilestoneCopy(streak: number): {
  title: string;
  body: string;
} {
  return {
    title: `${streak} days?? Okay I see you.`,
    body: pick([
      `${streak} days ago this was just some app you downloaded. Look at you now. ${APP_LINK}`,
      `Most people quit way before this. You are not most people (compliment). ${APP_LINK}`,
      `${streak} days in a row. That's genuinely kind of insane. In a good way. ${APP_LINK}`,
      `At this point your streak is basically a personality trait and honestly it's a good one. ${APP_LINK}`,
      `You showed up on the busy days too. That's the part that actually matters. ${APP_LINK}`,
      `It stopped being a habit a while ago. It's just who you are now. Kinda cool. ${APP_LINK}`,
      `You said you'd be consistent and then you actually were?? Rare. ${APP_LINK}`,
      `Your past self would be embarrassingly proud right now. ${APP_LINK}`,
      `${streak} days and you came back today anyway. I respect it. ${APP_LINK}`,
      `Consistency is boring until you realize almost nobody actually does it. You do. ${APP_LINK}`,
    ]),
  };
}

export function dailyNudgeCopy(): { title: string; body: string } {
  return {
    title: `Hey. Pomodoro time.`,
    body: pick([
      `The task is probably less awful than the anxiety of avoiding it. Just saying. ${APP_LINK}`,
      `Do one session before your brain opens 14 tabs and calls it "research." ${APP_LINK}`,
      `Starting is the hard part. Everything after that is just vibing. ${APP_LINK}`,
      `Small progress still counts. Tiny wins are wins. ${APP_LINK}`,
      `You don't have to finish it. You just have to start. That's the whole trick. ${APP_LINK}`,
    ]),
  };
}

export function comebackCopy(daysAway: number): {
  title: string;
  body: string;
} {
  return {
    title: `${daysAway} days? Welcome back, weirdo.`,
    body: pick([
      `Streak's gone but you're not starting from zero — you already know how to do this. ${APP_LINK}`,
      `${daysAway} days off just means today feels harder than it actually is. Do one session anyway. ${APP_LINK}`,
      `Whatever kept you away for ${daysAway} days — it's probably not relevant anymore. Let's go. ${APP_LINK}`,
    ]),
  };
}

export function focusCompleteCopy(): { title: string; body: string } {
  return {
    title: `Pomodoro done. Nice.`,
    body: pick([
      `That's the part of the day you won't cringe about later. ${APP_LINK}`,
      `You were avoiding it and you did it anyway. That's actually the whole skill. ${APP_LINK}`,
      `25 minutes of real work. Genuinely most people didn't do that today. ${APP_LINK}`,
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
