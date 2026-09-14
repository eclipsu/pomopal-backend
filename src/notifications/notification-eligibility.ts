export const FOCUS_MINUTE_MILESTONES = [
  100, 500, 1000, 2500, 5000, 10000,
] as const;

export const FOCUS_COMPLETE_SESSION_COUNTS = new Set([1, 3, 5, 8]);

export const GLOBAL_TOP_N = 5;

export function shouldAnnounceSessionCount(count: number): boolean {
  return FOCUS_COMPLETE_SESSION_COUNTS.has(count);
}

export function crossedMilestone(
  before: number,
  after: number,
  thresholds: readonly number[] = FOCUS_MINUTE_MILESTONES,
): number | null {
  let hit: number | null = null;
  for (const t of thresholds) {
    if (before < t && after >= t) hit = t;
  }
  return hit;
}

export function goalCrossed(
  before: number,
  after: number,
  goal: number,
): boolean {
  return before < goal && after >= goal;
}

/** True when `passer` moved from ≤ `youBefore` to > `youAfter` relative ranking by minutes. */
export function didPasserOvertake(args: {
  youBefore: number;
  youAfter: number;
  passerBefore: number;
  passerAfter: number;
}): boolean {
  const { youBefore, youAfter, passerBefore, passerAfter } = args;
  // Passer was behind or tied, then strictly ahead after their session.
  return passerBefore <= youBefore && passerAfter > youAfter;
}

export function isGlobalTop(rank: number | null, n = GLOBAL_TOP_N): boolean {
  return rank != null && rank >= 1 && rank <= n;
}

export function jitterMsForUser(userId: string): number {
  const seed = parseInt(userId.replace(/-/g, '').slice(0, 8), 16);
  if (Number.isNaN(seed)) return 0;
  return (seed % 59) * 60 * 1000;
}
