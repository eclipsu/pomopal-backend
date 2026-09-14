export type StreakWeekDay = {
  /** Short label e.g. Su, Mo */
  label: string;
  completed: boolean;
  /** Highlight today (orange) */
  isToday?: boolean;
};

export type StreakUpdateCard = {
  title: string;
  body?: string;
  imageUrl?: string;
  imageAlt?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  weekDays: StreakWeekDay[];
  footer?: string;
  preheader?: string;
  brandName?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripPlain(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

function dayCircleHtml(day: StreakWeekDay): string {
  if (day.completed && day.isToday) {
    return `<td align="center" style="padding:0 4px;">
      <div style="width:36px;height:36px;border-radius:50%;background:#ff9600;
                  line-height:36px;text-align:center;font-size:16px;color:#fff;
                  font-weight:700;font-family:${SANS};">✓</div>
    </td>`;
  }
  if (day.completed) {
    return `<td align="center" style="padding:0 4px;">
      <div style="width:36px;height:36px;border-radius:50%;background:#1cb0f6;
                  line-height:36px;text-align:center;font-size:16px;color:#fff;
                  font-weight:700;font-family:${SANS};">✓</div>
    </td>`;
  }
  if (day.isToday) {
    return `<td align="center" style="padding:0 4px;">
      <div style="width:36px;height:36px;border-radius:50%;background:#fff;
                  border:3px solid #ff9600;box-sizing:border-box;
                  line-height:30px;text-align:center;font-size:14px;color:#ff9600;
                  font-weight:700;font-family:${SANS};">!</div>
    </td>`;
  }
  return `<td align="center" style="padding:0 4px;">
    <div style="width:36px;height:36px;border-radius:50%;background:#e5e5e5;line-height:36px;">&nbsp;</div>
  </td>`;
}

function buildWeekProgressHtml(days: StreakWeekDay[]): string {
  if (!days?.length) return '';

  const labels = days
    .map((d) => {
      const label = escapeHtml(d.label);
      return `<td align="center" style="padding:0 4px 8px 4px;
        font-family:${SANS};font-size:13px;font-weight:700;color:#afafaf;">${label}</td>`;
    })
    .join('');

  const circles = days.map(dayCircleHtml).join('');

  return `
    <tr>
      <td align="center" style="padding:40px 0 0 0;">
        <p style="margin:0 0 20px;font-family:${SANS};font-size:22px;font-weight:800;color:#3c3c3c;">
          Your weekly progress
        </p>
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
          <tr>${labels}</tr>
          <tr>${circles}</tr>
        </table>
      </td>
    </tr>`;
}

/** Duo-themed streak email: flat white canvas, no card chrome. */
export function buildStreakUpdateEmailHtml(card: StreakUpdateCard): string {
  const brand = escapeHtml(card.brandName ?? 'pomopal');
  const title = escapeHtml(card.title);
  const body = card.body ? escapeHtml(card.body) : '';
  const footer =
    card.footer ?? 'Keep your streak alive with a pomodoro!';
  const preheader =
    card.preheader ?? `${card.title} — ${stripPlain(footer)}`.slice(0, 100);
  const ctaLabel = escapeHtml(card.ctaLabel ?? 'START A POMODORO');
  const ctaUrl = card.ctaUrl ?? 'https://pomopal.lol';

  const imageBlock = card.imageUrl
    ? `<tr>
        <td align="center" style="padding:8px 0 28px 0;">
          <img src="${card.imageUrl}" alt="${escapeHtml(card.imageAlt ?? '')}"
               width="200" draggable="false"
               style="display:block;border:0;outline:none;max-width:100%;height:auto;
                      -webkit-user-drag:none;user-select:none;-moz-user-select:none;
                      pointer-events:none;">
        </td>
      </tr>`
    : `<tr>
        <td align="center" style="padding:8px 0 28px 0;font-size:72px;line-height:1;">🍅</td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;</span>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 20px 56px 20px;">
        <table width="480" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:480px;">

          <tr>
            <td align="center" style="padding:0 0 28px 0;">
              <p style="margin:0;font-family:${SANS};font-size:28px;font-weight:800;
                         color:#e53e3e;letter-spacing:-0.02em;">
                ${brand}
              </p>
            </td>
          </tr>

          ${imageBlock}

          <tr>
            <td align="center" style="padding:0 12px 24px 12px;">
              <h1 style="margin:0;font-family:${SANS};font-size:28px;font-weight:800;
                         color:#3c3c3c;line-height:1.25;">
                ${title}
              </h1>
              ${
                body
                  ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:16px;
                               color:#777777;line-height:1.5;">${body}</p>`
                  : ''
              }
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:8px 0 0 0;">
              <a href="${ctaUrl}"
                 style="display:inline-block;background:#1cb0f6;color:#ffffff;
                        font-family:${SANS};font-size:15px;font-weight:800;
                        letter-spacing:0.04em;text-decoration:none;text-transform:uppercase;
                        padding:16px 36px;border-radius:16px;
                        border-bottom:4px solid #1899d6;">
                ${ctaLabel}
              </a>
            </td>
          </tr>

          ${buildWeekProgressHtml(card.weekDays)}

          <tr>
            <td align="center" style="padding:28px 16px 0 16px;">
              <p style="margin:0;font-family:${SANS};font-size:14px;color:#afafaf;line-height:1.5;">
                ${escapeHtml(footer)}
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

export function buildStreakUpdateEmailText(card: StreakUpdateCard): string {
  const days = (card.weekDays ?? [])
    .map((d) => `${d.label}:${d.completed ? 'done' : d.isToday ? 'today' : '-'}`)
    .join(' ');
  return [
    card.title,
    card.body ?? '',
    '',
    'Your weekly progress',
    days,
    '',
    card.footer ?? 'Keep your streak alive with a pomodoro!',
    card.ctaUrl ? `${card.ctaLabel ?? 'Start a pomodoro'}: ${card.ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Build Su–Sa labels for a YYYY-MM-DD date string (UTC calendar math). */
export function weekdayLabelFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][day];
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Last 7 local days ending on `todayYmd` (inclusive). */
export function rollingWeekYmds(todayYmd: string): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    out.push(addDaysYmd(todayYmd, -i));
  }
  return out;
}

export function buildWeekDaysFromStats(
  todayYmd: string,
  completedDates: Iterable<string>,
): StreakWeekDay[] {
  const completed = new Set(completedDates);
  return rollingWeekYmds(todayYmd).map((ymd) => ({
    label: weekdayLabelFromYmd(ymd),
    completed: completed.has(ymd),
    isToday: ymd === todayYmd,
  }));
}
