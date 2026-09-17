import * as nodemailer from 'nodemailer';
import { NotificationCardCta } from './notification-card-email';
import {
  buildStreakUpdateEmailHtml,
  buildStreakUpdateEmailText,
  StreakWeekDay,
} from './streak-update-email';
import {
  buildLeaderboardEmailHtml,
  buildLeaderboardEmailText,
  LeaderboardEmailRow,
} from './leaderboard-email';
import {
  fetchUrlAsInlineImage,
  InlineEmailImage,
  NOTIFICATION_IMAGE_CID,
} from './email-inline-image';

export type { InlineEmailImage } from './email-inline-image';

export interface AnnouncementSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

export interface SendAnnouncementOptions {
  to: string;
  title: string;
  body: string | null;
  imageUrl?: string;
  imageAlt?: string;
  inlineImage?: InlineEmailImage;
  cta?: NotificationCardCta;
  preheader?: string;
  /** Flat Duo-style layout by default; leaderboard for league mail. Cards removed. */
  variant?: 'streak_update' | 'leaderboard';
  weekDays?: StreakWeekDay[];
  leaderboardRows?: LeaderboardEmailRow[];
  boardTitle?: string;
  footer?: string;
}

export async function sendAnnouncementEmail(
  smtp: AnnouncementSmtpConfig,
  opts: SendAnnouncementOptions,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  let inlineImage = opts.inlineImage;
  let imageUrl = opts.imageUrl;

  if (!inlineImage && imageUrl?.startsWith('http')) {
    inlineImage = (await fetchUrlAsInlineImage(imageUrl)) ?? undefined;
    if (inlineImage) imageUrl = undefined;
  }

  const resolvedImageUrl = inlineImage
    ? `cid:${NOTIFICATION_IMAGE_CID}`
    : imageUrl;

  const useLeaderboard = opts.variant === 'leaderboard';

  let html: string;
  let text: string;

  if (useLeaderboard) {
    const boardCard = {
      title: opts.title,
      body: opts.body ?? undefined,
      imageUrl: resolvedImageUrl,
      imageAlt: opts.imageAlt,
      ctaLabel: opts.cta?.label,
      ctaUrl: opts.cta?.url,
      rows: opts.leaderboardRows ?? [],
      boardTitle: opts.boardTitle,
      footer: opts.footer,
      preheader: opts.preheader,
    };
    html = buildLeaderboardEmailHtml(boardCard);
    text = buildLeaderboardEmailText(boardCard);
  } else {
    const streakCard = {
      title: opts.title,
      body: opts.body ?? undefined,
      imageUrl: resolvedImageUrl,
      imageAlt: opts.imageAlt,
      ctaLabel: opts.cta?.label ?? 'OPEN POMOPAL',
      ctaUrl: opts.cta?.url ?? 'https://pomopal.lol',
      weekDays: opts.weekDays ?? [],
      footer: opts.footer,
      preheader: opts.preheader,
    };
    html = buildStreakUpdateEmailHtml(streakCard);
    text = buildStreakUpdateEmailText(streakCard);
  }

  const attachments = inlineImage
    ? [
        {
          filename: inlineImage.filename,
          content: inlineImage.content,
          cid: inlineImage.cid,
          contentType: inlineImage.contentType,
          contentDisposition: 'inline' as const,
        },
      ]
    : undefined;

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.from}>`,
    to: opts.to,
    subject: opts.title,
    html,
    text,
    attachments,
  });
}
