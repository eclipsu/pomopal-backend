/**
 * Preview the leaderboard email (flat ranked list).
 *
 * Usage:
 *   npm run script:preview-leaderboard
 *   npm run script:preview-leaderboard -- --out /tmp/board.html
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildLeaderboardEmailHtml,
  SAMPLE_LEADERBOARD_ROWS,
} from '../src/mail/leaderboard-email';

function parseArgs(argv: string[]) {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  return {
    out: get('--out'),
    title: get('--title') ?? 'Your week in focus',
    body:
      get('--body') ??
      '120 minutes across 6 sessions. Global week rank: #3.',
  };
}

const args = parseArgs(process.argv.slice(2));

const html = buildLeaderboardEmailHtml({
  title: args.title,
  body: args.body,
  imageAlt: args.title,
  ctaLabel: 'VIEW LEADERBOARD',
  ctaUrl: 'https://pomopal.lol',
  footer: 'Climb the board with another pomodoro!',
  rows: SAMPLE_LEADERBOARD_ROWS,
});

if (args.out) {
  const path = resolve(args.out);
  writeFileSync(path, html, 'utf8');
  console.log(`Wrote ${path}`);
} else {
  console.log(html);
}
