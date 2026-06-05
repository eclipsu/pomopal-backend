/**
 * Fan-out an announcement to every user (in-app + email).
 *
 * Usage:
 *   npm run script:send-announcement -- "Body only (default title: Announcement)"
 *   npm run script:send-announcement -- "Title" "Body"
 *   npm run script:send-announcement -- --dry-run "Title" "Body"
 *   npm run script:send-announcement -- --no-email "Title" "Body"
 *   npm run script:send-announcement -- --image https://pomopal.lol/og.png --link https://pomopal.lol --cta "Open Pomopal" "Title" "Body"
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import dbConfigFactory from '../src/config/dbConfig';
import { User } from '../src/entities/user.entity';
import { Notification } from '../src/entities/notification.entity';
import { NotificationPreferences } from '../src/entities/notification-preferences.entity';
import {
  AnnouncementSmtpConfig,
  sendAnnouncementEmail,
} from '../src/mail/announcement-email';

function loadEnvFile(): void {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const BATCH_SIZE = 200;
const EMAIL_DELAY_MS = 100;

function parseArgs(argv: string[]): {
  dryRun: boolean;
  sendEmail: boolean;
  title: string;
  body: string;
  imageUrl?: string;
  link?: string;
  ctaLabel: string;
} {
  const args = [...argv];
  const dryRun = args.includes('--dry-run');
  const sendEmail = !args.includes('--no-email');

  const getFlag = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    return args[i + 1];
  };

  const imageUrl = getFlag('--image');
  const link = getFlag('--link');
  const ctaLabel = getFlag('--cta') ?? 'Open Pomopal';

  const filtered = args.filter(
    (_, i, arr) =>
      arr[i - 1] !== '--image' &&
      arr[i - 1] !== '--link' &&
      arr[i - 1] !== '--cta' &&
      !['--dry-run', '--no-email', '--image', '--link', '--cta'].includes(
        args[i],
      ),
  );

  if (filtered.length === 0) {
    console.error(
      'Usage: npm run script:send-announcement -- [--dry-run] [--no-email] "Body"\n' +
        '   or: npm run script:send-announcement -- [--dry-run] [--no-email] "Title" "Body"',
    );
    process.exit(1);
  }

  if (filtered.length === 1) {
    return {
      dryRun,
      sendEmail,
      title: 'Announcement',
      body: filtered[0],
      imageUrl,
      link,
      ctaLabel,
    };
  }

  return {
    dryRun,
    sendEmail,
    title: filtered[0],
    body: filtered.slice(1).join(' '),
    imageUrl,
    link,
    ctaLabel,
  };
}

function getSmtpConfig(): AnnouncementSmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !from || !user || !pass) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user,
    pass,
    from,
    fromName: process.env.SMTP_FROM_NAME ?? 'Pomopal',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main(): Promise<void> {
  const { dryRun, sendEmail, title, body, imageUrl, link, ctaLabel } =
    parseArgs(process.argv.slice(2));

  if (!body.trim()) {
    console.error('Body cannot be empty.');
    process.exit(1);
  }

  const smtp = sendEmail ? getSmtpConfig() : null;
  if (sendEmail && !smtp) {
    console.error(
      'Email enabled but SMTP is not configured. Set SMTP_HOST, SMTP_FROM, SMTP_USER, and SMTP_PASS in .env, or pass --no-email.',
    );
    process.exit(1);
  }

  const options = dbConfigFactory();
  const dataSource = new DataSource({
    ...options,
    entities: [resolve(__dirname, '../src/**/*.entity{.ts,.js}')],
  });

  await dataSource.initialize();

  try {
    const users = await dataSource.getRepository(User).find({
      select: ['id', 'email'],
    });

    if (!users.length) {
      console.log('No users found.');
      return;
    }

    const runId = randomUUID().slice(0, 8);
    console.log(`Run ${runId} — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Title: ${title}`);
    console.log(`Body:  ${body}`);
    console.log(`Users: ${users.length}`);
    console.log(`Email: ${sendEmail ? 'yes' : 'no'}`);
    if (imageUrl) console.log(`Image: ${imageUrl}`);
    if (link) console.log(`Link:  ${link} (${ctaLabel})`);

    if (dryRun) {
      if (sendEmail) {
        console.log(`Would email ${users.length} user(s).`);
      }
      console.log('Dry run complete. No rows inserted or emails sent.');
      return;
    }

    const repo = dataSource.getRepository(Notification);
    const prefsRepo = dataSource.getRepository(NotificationPreferences);
    let inserted = 0;
    let skipped = 0;
    let emailed = 0;
    let emailFailed = 0;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const dedupeKeys = batch.map(
        (u) => `announcement:${runId}:${u.id}`,
      );

      const existing = await repo.find({
        where: { dedupe_key: In(dedupeKeys) },
        select: ['dedupe_key'],
      });
      const existingSet = new Set(existing.map((r) => r.dedupe_key));

      const prefs = await prefsRepo.find({
        where: { user_id: In(batch.map((u) => u.id)) },
      });
      const prefsMap = new Map(prefs.map((p) => [p.user_id, p]));

      const toNotify = batch.filter((u) => {
        if (existingSet.has(`announcement:${runId}:${u.id}`)) return false;
        const pref = prefsMap.get(u.id);
        return pref ? pref.product_announcements : true;
      });

      const rows = toNotify.map((u) =>
        repo.create({
          user_id: u.id,
          type: 'announcement',
          title,
          body,
          read_at: null,
          dedupe_key: `announcement:${runId}:${u.id}`,
        }),
      );

      if (rows.length) {
        await repo.insert(rows);
        inserted += rows.length;
      }
      skipped += batch.length - toNotify.length;

      if (sendEmail && smtp) {
        for (const user of toNotify) {
          try {
            await sendAnnouncementEmail(smtp, {
              to: user.email,
              title,
              body,
              imageUrl,
              cta: link ? { label: ctaLabel, href: link } : undefined,
            });
            emailed += 1;
          } catch (err) {
            emailFailed += 1;
            console.error(`Failed to email ${user.email}:`, err);
          }
          await sleep(EMAIL_DELAY_MS);
        }
      }
    }

    console.log(
      `Inserted: ${inserted}, skipped (duplicate): ${skipped}, emailed: ${emailed}, email failed: ${emailFailed}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
