import { NotificationTemplate } from '../entities/notification-template.entity';

export function isTemplateEligible(
  template: NotificationTemplate,
  ctx: Record<string, unknown>,
): boolean {
  const rules = template.eligibility_rules ?? {};
  const num = (key: string) =>
    typeof rules[key] === 'number' ? (rules[key] as number) : undefined;
  const bool = (key: string) =>
    typeof rules[key] === 'boolean' ? (rules[key] as boolean) : undefined;

  const streak = (ctx.streak as number | undefined) ?? 0;
  const daysAway = (ctx.daysAway as number | undefined) ?? 0;
  const completedSessions = (ctx.completedSessions as number | undefined) ?? 0;
  const isLastChance = Boolean(ctx.isLastChance);

  const minStreak = num('minStreak');
  if (minStreak !== undefined && streak < minStreak) return false;

  const maxStreak = num('maxStreak');
  if (maxStreak !== undefined && streak > maxStreak) return false;

  const minDaysAway = num('minDaysAway');
  if (minDaysAway !== undefined && daysAway < minDaysAway) return false;

  const maxDaysAway = num('maxDaysAway');
  if (maxDaysAway !== undefined && daysAway > maxDaysAway) return false;

  const minCompletedSessions = num('minCompletedSessions');
  if (
    minCompletedSessions !== undefined &&
    completedSessions < minCompletedSessions
  ) {
    return false;
  }

  if (bool('requiresLastChance') === true && !isLastChance) return false;
  if (bool('requiresEarlyNudge') === true && isLastChance) return false;
  if (bool('requiresTravelMotivation') === true && !ctx.travelMotivation) {
    return false;
  }

  return true;
}
