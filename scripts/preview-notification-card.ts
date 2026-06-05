/**
 * Preview the notification card HTML in a browser or write to a file.
 *
 * Usage:
 *   npm run script:preview-notification-card
 *   npm run script:preview-notification-card -- --out /tmp/card.html
 *   npm run script:preview-notification-card -- --image https://pomopal.lol/og.png --link https://pomopal.lol --cta "Open Pomopal"
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { buildNotificationCardHtml } from '../src/mail/notification-card-email';

function parseArgs(argv: string[]) {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  return {
    out: get('--out'),
    title: get('--title') ?? '7-day streak!',
    body:
      get('--body') ??
      'You hit 7 days in a row. That is real focus momentum — keep the pomodoros coming.',
    image: get('--image'),
    link: get('--link') ?? 'https://pomopal.lol',
    cta: get('--cta') ?? 'Open Pomopal',
  };
}

const args = parseArgs(process.argv.slice(2));

const html = buildNotificationCardHtml({
  title: args.title,
  body: args.body,
  imageUrl: args.image,
  imageAlt: args.title,
  cta: args.link ? { label: args.cta, href: args.link } : undefined,
  preheader: args.body.slice(0, 100),
});

if (args.out) {
  const path = resolve(args.out);
  writeFileSync(path, html, 'utf8');
  console.log(`Wrote ${path}`);
} else {
  console.log(html);
}
