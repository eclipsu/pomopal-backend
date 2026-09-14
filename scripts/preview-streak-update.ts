/**
 * Preview the streak update email (flat, no card).
 *
 * Usage:
 *   npm run script:preview-streak-update
 *   npm run script:preview-streak-update -- --out /tmp/streak.html
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { buildStreakUpdateEmailHtml } from '../src/mail/streak-update-email';

function parseArgs(argv: string[]) {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  return {
    out: get('--out'),
    title: get('--title') ?? 'Keep your streak going?',
    body:
      get('--body') ??
      'Your streak is on grace — one pomodoro today keeps it alive.',
    image: get('--image') ?? 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-mad.png',
  };
}

const args = parseArgs(process.argv.slice(2));

const html = buildStreakUpdateEmailHtml({
  title: args.title,
  body: args.body,
  imageUrl: args.image,
  imageAlt: args.title,
  ctaLabel: 'START A POMODORO',
  ctaUrl: 'https://pomopal.lol',
  footer: 'Keep your streak alive with a pomodoro!',
  weekDays: [
    { label: 'Sa', completed: true },
    { label: 'Su', completed: true, isToday: false },
    { label: 'Mo', completed: true },
    { label: 'Tu', completed: true },
    { label: 'We', completed: true },
    { label: 'Th', completed: false },
    { label: 'Fr', completed: false, isToday: true },
  ],
});

if (args.out) {
  const path = resolve(args.out);
  writeFileSync(path, html, 'utf8');
  console.log(`Wrote ${path}`);
} else {
  console.log(html);
}
