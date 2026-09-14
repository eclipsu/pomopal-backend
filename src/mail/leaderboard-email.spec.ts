import {
  buildLeaderboardEmailHtml,
  buildLeaderboardEmailText,
  SAMPLE_LEADERBOARD_ROWS,
} from './leaderboard-email';

describe('leaderboard-email', () => {
  it('renders ranked rows and highlights you', () => {
    const html = buildLeaderboardEmailHtml({
      title: 'Your week in focus',
      body: '120 minutes across 6 sessions.',
      rows: SAMPLE_LEADERBOARD_ROWS,
      ctaLabel: 'VIEW LEADERBOARD',
      ctaUrl: 'https://pomopal.lol',
    });

    expect(html).toContain('pomopal');
    expect(html).toContain('Your week in focus');
    expect(html).toContain("This week's leaderboard");
    expect(html).toContain('Maya');
    expect(html).toContain('YOU');
    expect(html).toContain('VIEW LEADERBOARD');
    expect(html).toContain('#ddf4ff');
  });

  it('builds plain text board', () => {
    const text = buildLeaderboardEmailText({
      title: 'Global top 5',
      rows: SAMPLE_LEADERBOARD_ROWS,
    });
    expect(text).toContain('#1 Maya');
    expect(text).toContain('#15 You (you)');
  });

  it('renders gap before viewer outside top 5', () => {
    const html = buildLeaderboardEmailHtml({
      title: 'Board',
      rows: SAMPLE_LEADERBOARD_ROWS,
    });
    expect(html).toContain('···');
    expect(html).toContain('15');
  });
});
