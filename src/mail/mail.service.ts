import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface FriendInviteOptions {
  to: string;
  requesterName: string;
  acceptLink: string;
  expiresAt: Date;
}

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT', 587),
      secure: config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendFriendInvite(opts: FriendInviteOptions): Promise<void> {
    const expiryText = opts.expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    await this.transporter.sendMail({
      from: `"Pomodoro App" <${this.config.get('SMTP_FROM')}>`,
      to: opts.to,
      subject: `${opts.requesterName} wants to be your friend 🍅`,
      html: this.inviteTemplate(
        opts.requesterName,
        opts.acceptLink,
        expiryText,
      ),
      text: this.inviteText(opts.requesterName, opts.acceptLink, expiryText),
    });
  }

  private inviteTemplate(name: string, link: string, expiry: string): string {
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

    <h1 style="margin: 0 0 8px; font-size: 22px; color: #111827; text-align: center;">
      Friend Request
    </h1>
    
    <p style="color: #6b7280; text-align: center; margin: 0 0 32px; font-size: 15px;">
      <strong style="color: #111827;">${name}</strong> wants to connect with you
      and see each other's focus stats.
    </p>

    <a href="${link}"
       style="display: block; background: #ef4444; color: white; text-align: center;
              padding: 14px 24px; border-radius: 8px; text-decoration: none;
              font-weight: 600; font-size: 15px; margin-bottom: 24px;">
      Accept Friend Request
    </a>

    <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0;">
      This link expires on ${expiry}. If you don't know who this is, you can safely ignore it.
    </p>
  </div>
</body>
</html>`;
  }

  private inviteText(name: string, link: string, expiry: string): string {
    return [
      `${name} wants to be your friend on Pomodoro App.`,
      '',
      `Accept the request here: ${link}`,
      '',
      `This link expires on ${expiry}.`,
      "If you don't know who this is, you can safely ignore this email.",
    ].join('\n');
  }
}
