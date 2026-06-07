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
      title: pick([
        `You have ${streak} days and it is 11 PM and I genuinely cannot believe you are doing this right now.`,
        `${streak} days of showing up every single day and tonight is the night you decide not to? Really?`,
        `I'm not mad, I'm just ${streak} days deep and extremely concerned about your choices right now.`,
        `It's 11 PM and your ${streak}-day streak is sitting in the corner looking at you like a disappointed parent.`,
      ]),
      body: pick([
        `You have survived ${streak} days of bad moods, busy days, and every excuse your brain has ever invented, and you're going to let it die because you couldn't be bothered to open an app before midnight. One pomodoro. Set a timer and stare at the wall for 25 minutes if you have to, just start. ${APP_LINK}`,
        `${streak} days is every day you chose to show up when you really didn't want to, and there were definitely days in there where you really didn't want to, so don't let tonight be the one you remember as the dumb reason it ended. ${APP_LINK}`,
        `Future you is watching this exact moment and they are so stressed right now because they worked really hard to have that streak and you're the only person who can save them, and all it costs you is 25 minutes before midnight. ${APP_LINK}`,
        `${streak} days is genuinely hard to build and you know this because you built it, and it took weeks of actually showing up while losing it takes one night of just not bothering, and you are better than one night of not bothering. ${APP_LINK}`,
        `Your streak has survived worse nights than whatever tonight is, but it cannot survive you not opening the app, and you've spent longer than 25 minutes looking for your charger before so you definitely have time. ${APP_LINK}`,
      ]),
    };
  }

  return {
    title: pick([
      `Your ${streak}-day streak is having a little anxiety spiral right now and honestly it has every right to.`,
      `You've done ${streak} days in a row and tonight is apparently the night you're going to start questioning everything.`,
      `${streak} days of not skipping and right now your streak is just pacing around waiting to see what you're going to do.`,
      `The ${streak}-day streak is not mad, it's just watching you very carefully right now.`,
    ]),
    body: pick([
      `You've done ${streak} days in a row, which means you've definitely done it on days where you felt exactly like you do right now, and that version of you figured it out somehow so this version of you will too. ${APP_LINK}`,
      `Somewhere between day 1 and day ${streak} this stopped being about willpower and started just being what you do every day, so don't overthink it tonight and just do the thing like you always do. ${APP_LINK}`,
      `${streak} days ago you made a decision and every single day since then you backed it up, and today isn't actually any different from those days even if it feels like it is right now. ${APP_LINK}`,
      `You're ${streak} days in and the people who quit on day 2 would find this notification genuinely insulting, so prove them right to feel that way. ${APP_LINK}`,
      `${streak} days of momentum against one night of not feeling like it, and one of those is really hard to rebuild once it's gone while the other one passes in 25 minutes. ${APP_LINK}`,
    ]),
  };
}

export function streakMilestoneCopy(streak: number): {
  title: string;
  body: string;
} {
  return {
    title: pick([
      `You actually pulled off ${streak} days in a row and I don't think you're fully appreciating how rare that is.`,
      `${streak} consecutive days of showing up, which at this point means you're not really trying to build a habit anymore — you just have one.`,
      `Okay so ${streak} days happened and I feel like we need to talk about the fact that you're genuinely not like most people who download this app.`,
      `${streak} days in a row is the kind of thing people say they're going to do and then don't, and yet here you are having actually done it.`,
    ]),
    body: pick([
      `${streak} days ago you were someone who was going to "try to be more consistent," and now you're just consistent, and that shift happened so quietly you probably didn't even notice it happening. ${APP_LINK}`,
      `Most people set the exact same goal you set and most people are not at day ${streak}, and the difference isn't talent or motivation or some better morning routine — you just kept opening the app on the days they didn't, and it turns out that's genuinely the whole thing. ${APP_LINK}`,
      `${streak} days means you showed up on at least a few days where you absolutely did not want to, and that's the part that actually counts because anyone can do it when they feel like it but you did it when you didn't. ${APP_LINK}`,
      `At some point between day 1 and day ${streak} this became part of your identity without you really deciding it would, and now you're just a person who does their pomodoros, which is a genuinely good thing to be. ${APP_LINK}`,
      `Your past self downloaded this app hoping it would maybe help a little and they would be completely unhinged with excitement right now if they could see day ${streak}. ${APP_LINK}`,
      `You said you'd be different this time and then you actually were, which is rarer than it sounds and you should probably sit with that for a second. ${APP_LINK}`,
    ]),
  };
}

export function dailyNudgeCopy(): { title: string; body: string } {
  return {
    title: pick([
      `Your future self is already grateful for the session you're about to do right now.`,
      `The work has been sitting there all day waiting for you and it's starting to get a little impatient.`,
      `There's a version of your evening that involves having already done a pomodoro and it's a much better evening.`,
    ]),
    body: pick([
      `The task you're avoiding isn't actually that bad — the anxiety about the task is bad, and the task itself takes 25 minutes and then it's just done and you feel weirdly good about it for the rest of the evening, and you know this trap and you keep falling for it anyway. ${APP_LINK}`,
      `If you skip today nothing dramatic happens, you'll just have that low-grade guilt following you around all evening like it always does when you don't do the thing you knew you were supposed to do, and if you do one session it goes away and you get your evening back. ${APP_LINK}`,
      `You don't have to be in the mood or have a plan or feel ready — you just have to open the app, press start, and let the timer do the rest, because that's genuinely the whole system and it works every time you actually use it. ${APP_LINK}`,
      `Whatever's on your list right now has been on your list for a while, and the only thing that's ever actually made it shorter is sitting down and doing the work, so here's your reminder to go do that. ${APP_LINK}`,
    ]),
  };
}

export function comebackCopy(daysAway: number): {
  title: string;
  body: string;
} {
  return {
    title: pick([
      `You were gone for ${daysAway} days and you came back anyway, which honestly says more about you than the streak ever did.`,
      `It's been ${daysAway} days and I'm not going to make it weird, I'm just really glad you're back.`,
      `${daysAway} days away and you still came back, which means the part of you that actually wants to do this is still in there somewhere.`,
      `After ${daysAway} days away you could have just never opened this app again and yet here you are, which is kind of the whole thing.`,
    ]),
    body: pick([
      `${daysAway} days is a long time and also not that long, and the streak is gone which stings, but you already know how to do this — day 1 the first time was hard because you didn't know if you could pull it off, and day 1 right now is just a formality because you already proved you can. ${APP_LINK}`,
      `Whatever happened in the last ${daysAway} days doesn't really matter anymore, and coming back is genuinely harder than staying consistent so the fact that you're here at all is the same energy that built the streak in the first place. ${APP_LINK}`,
      `Your brain is going to tell you it'll take forever to get back into it after ${daysAway} days away, but one session and it clicks back like you never left, and the only way to find out is to go do the session. ${APP_LINK}`,
      `${daysAway} days away means today feels harder than it actually is, and the gap between "I haven't done this in a while" and "I'm back in my routine" is exactly one session long. ${APP_LINK}`,
    ]),
  };
}

export function focusCompleteCopy(): { title: string; body: string } {
  return {
    title: pick([
      `You didn't feel like doing that and you did it anyway, which is the only productivity skill that actually matters.`,
      `That pomodoro is done and nobody can ever take it away from you, which sounds dramatic but is completely true.`,
      `You were going to skip that and you didn't, and now you get to feel unreasonably good about it for the rest of the day.`,
      `25 minutes ago you were avoiding this and now it's finished, and that gap between avoiding and doing is exactly what separates you from where you were a few months ago.`,
    ]),
    body: pick([
      `You didn't feel like it, you did it anyway, and now it's done, and that is the entire reason people who are consistent actually stay consistent — not because they always feel like it, but because they stopped waiting until they did. ${APP_LINK}`,
      `That 25 minutes is just yours now and the task got smaller and the streak got longer and you get to feel this specific flavor of quiet satisfaction for the rest of the day, which is genuinely one of the better feelings this app can give you. ${APP_LINK}`,
      `The version of you that was going to skip this session is having a worse evening right now in some parallel universe, and you made the call that means you don't have to be that person tonight. ${APP_LINK}`,
      `One completed session is worth more than an hour of "I'll start after this one thing" and you know that better than anyone because you've been on both sides of it. ${APP_LINK}`,
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
