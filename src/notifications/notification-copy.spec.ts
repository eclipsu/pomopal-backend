import {
  STREAK_MILESTONES,
  dedupeKey,
  streakAtRiskCopy,
  streakMilestoneCopy,
  dailyNudgeCopy,
  comebackCopy,
  focusCompleteCopy,
} from './notification-copy';

describe('notification-copy', () => {
  it('defines expected streak milestones', () => {
    expect(STREAK_MILESTONES).toEqual([3, 7, 14, 30, 50, 100]);
  });

  it('builds stable dedupe keys', () => {
    expect(dedupeKey('streak_at_risk', 'user-1', '2026-06-01')).toBe(
      'streak_at_risk:user-1:2026-06-01',
    );
  });

  it('includes streak count in at-risk copy', () => {
    const { title, body } = streakAtRiskCopy(12);
    expect(title).toContain('12');
    expect(body.length).toBeGreaterThan(10);
  });

  it('includes streak count in milestone copy', () => {
    const { title } = streakMilestoneCopy(7);
    expect(title).toContain('7');
  });

  it('returns non-empty nudge and comeback messages', () => {
    expect(dailyNudgeCopy().title).toBeTruthy();
    const comeback = comebackCopy(4);
    expect(comeback.title).toBeTruthy();
    expect(comeback.body.length).toBeGreaterThan(10);
    expect(focusCompleteCopy().title).toBeTruthy();
  });
});
