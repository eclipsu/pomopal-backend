import * as nodemailer from 'nodemailer';
import {
  buildNotificationCardHtml,
  buildNotificationCardText,
  NotificationCardCta,
} from './notification-card-email';
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

  const card = {
    title: opts.title,
    body: opts.body ?? '',
    imageUrl: inlineImage ? `cid:${NOTIFICATION_IMAGE_CID}` : imageUrl,
    imageAlt: opts.imageAlt,
    cta: opts.cta,
    preheader: opts.preheader,
  };

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
    html: buildNotificationCardHtml(card),
    text: buildNotificationCardText(card),
    attachments,
  });
}
