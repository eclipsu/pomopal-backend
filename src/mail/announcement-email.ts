import * as nodemailer from 'nodemailer';
import {
  buildNotificationCardHtml,
  buildNotificationCardText,
  NotificationCardCta,
} from './notification-card-email';

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
  body: string;
  imageUrl?: string;
  imageAlt?: string;
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

  const card = {
    title: opts.title,
    body: opts.body,
    imageUrl: opts.imageUrl,
    imageAlt: opts.imageAlt,
    cta: opts.cta,
    preheader: opts.preheader,
  };

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.from}>`,
    to: opts.to,
    subject: opts.title,
    html: buildNotificationCardHtml(card),
    text: buildNotificationCardText(card),
  });
}
