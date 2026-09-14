import {
  addDaysYmd,
  buildStreakUpdateEmailHtml,
  buildStreakUpdateEmailText,
  buildWeekDaysFromStats,
  rollingWeekYmds,
  weekdayLabelFromYmd,
} from './streak-update-email';

describe('streak-update-email', () => {
  it('builds rolling week ending today', () => {
    expect(rollingWeekYmds('2026-06-01')).toEqual([
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
      '2026-06-01',
    ]);
    expect(addDaysYmd('2026-06-01', -1)).toBe('2026-05-31');
    expect(weekdayLabelFromYmd('2026-06-01')).toBe('Mo');
  });

  it('marks completed days and today', () => {
    const days = buildWeekDaysFromStats('2026-06-01', [
      '2026-05-26',
      '2026-05-28',
      '2026-05-29',
    ]);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({
      label: 'Tu',
      completed: true,
      isToday: false,
    });
    expect(days[6]).toEqual({
      label: 'Mo',
      completed: false,
      isToday: true,
    });
  });

  it('renders duo-themed streak html with week progress', () => {
    const html = buildStreakUpdateEmailHtml({
      title: 'Keep your streak going?',
      body: 'One pomodoro saves it.',
      imageUrl: 'https://example.com/pomo.png',
      weekDays: [
        { label: 'Sa', completed: true },
        { label: 'Su', completed: true, isToday: false },
        { label: 'Mo', completed: true },
        { label: 'Tu', completed: true },
        { label: 'We', completed: true },
        { label: 'Th', completed: false },
        { label: 'Fr', completed: false, isToday: true },
      ],
      footer: 'Keep your streak alive with a pomodoro!',
      ctaLabel: 'START A POMODORO',
      ctaUrl: 'https://pomopal.lol',
    });

    expect(html).toContain('pomopal');
    expect(html).toContain('Keep your streak going?');
    expect(html).toContain('Your weekly progress');
    expect(html).toContain('START A POMODORO');
    expect(html).toContain('#e53e3e');
    expect(html).toContain('#1cb0f6');
    expect(html).toContain('#ff9600');
    expect(html).toContain('draggable="false"');
    expect(html).not.toContain('border-radius:20px');
    expect(html).toContain('Keep your streak alive with a pomodoro!');
  });

  it('builds plain text summary', () => {
    const text = buildStreakUpdateEmailText({
      title: 'Streak Milestone',
      body: '7 days.',
      weekDays: [
        { label: 'Mo', completed: true },
        { label: 'Tu', completed: false, isToday: true },
      ],
      ctaUrl: 'https://pomopal.lol',
      ctaLabel: 'START A POMODORO',
    });
    expect(text).toContain('Streak Milestone');
    expect(text).toContain('Mo:done');
    expect(text).toContain('Tu:today');
    expect(text).toContain('https://pomopal.lol');
  });
});
