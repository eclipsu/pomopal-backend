export interface NotificationCardCta {
  label: string;
  url: string;
}

export interface NotificationCard {
  title: string;
  body: string;
  imageUrl?: string;
  imageAlt?: string;
  cta?: NotificationCardCta;
  preheader?: string;
}

export function buildNotificationCardText(card: NotificationCard): string {
  return [card.title, '', card.body].join('\n');
}

export function buildNotificationCardHtml(card: NotificationCard): string {
  const preheader = card.preheader ?? card.body.slice(0, 100);

  const imageBlock = card.imageUrl
    ? `<tr>
        <td align="center" style="padding:0 0 32px 0;">
          <img src="${card.imageUrl}" alt="${card.imageAlt ?? ''}"
               width="220" style="display:block;border:0;outline:none;text-decoration:none;">
        </td>
      </tr>`
    : '';

  const ctaBlock = card.cta
    ? `<tr>
        <td align="center" style="padding:32px 0 0 0;">
          <a href="${card.cta.url}"
             style="display:inline-block;background:#e53e3e;color:#ffffff;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                    font-size:15px;font-weight:600;text-decoration:none;
                    padding:14px 32px;border-radius:8px;">
            ${card.cta.label}
          </a>
        </td>
      </tr>`
    : '';

  // linkify trailing URL in body
  const bodyHtml = card.body.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" style="color:#e53e3e;text-decoration:none;font-weight:600;">Open app →</a>',
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${card.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">

  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:48px 20px;">

        <table width="520" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- top red bar -->
          <tr>
            <td style="background:#e53e3e;height:5px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- body -->
          <tr>
            <td style="padding:48px 48px 40px 48px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">

                <!-- logo -->
                <tr>
                  <td align="center" style="padding:0 0 36px 0;">
                    <span style="font-size:48px;line-height:1;">🍅</span>
                    <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                               font-size:13px;font-weight:600;letter-spacing:2px;
                               color:#e53e3e;text-transform:uppercase;">Pomopal</p>
                  </td>
                </tr>

                ${imageBlock}

                <!-- title -->
                <tr>
                  <td align="center" style="padding:0 0 16px 0;">
                    <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                               font-size:26px;font-weight:700;color:#111827;line-height:1.25;">
                      ${card.title}
                    </h1>
                  </td>
                </tr>

                <!-- body -->
                <tr>
                  <td align="center" style="padding:0 0 8px 0;">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                              font-size:16px;color:#4b5563;line-height:1.75;text-align:center;">
                      ${bodyHtml}
                    </p>
                  </td>
                </tr>

                ${ctaBlock}

              </table>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 48px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                         font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                You're getting this because you have notifications enabled on Pomopal.<br>
                <a href="https://pomopal.lol"
                   style="color:#9ca3af;text-decoration:underline;">Manage preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}