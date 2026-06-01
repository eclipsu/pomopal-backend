import * as nodemailer from 'nodemailer';

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
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function announcementHtml(title: string, body: string): string {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background: #f9fafb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white;
              border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 48px;">🍅</span>
    </div>
    <h1 style="margin: 0 0 16px; font-size: 22px; color: #111827; text-align: center;">
      ${safeTitle}
    </h1>
    <p style="color: #374151; margin: 0; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
      ${safeBody}
    </p>
  </div>
</body>
</html>`;
}

function announcementText(title: string, body: string): string {
  return [title, '', body].join('\n');
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

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.from}>`,
    to: opts.to,
    subject: opts.title,
    html: announcementHtml(opts.title, opts.body),
    text: announcementText(opts.title, opts.body),
  });
}
