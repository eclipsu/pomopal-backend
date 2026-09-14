import { stripHtml } from './notification-card-email';

export type LeaderboardEmailRow = {
  rank: number;
  name: string;
  minutes: number;
  /** Highlight the recipient's row. */
  isYou?: boolean;
  /** Render an ellipsis gap before this row (viewer outside top N). */
  gapBefore?: boolean;
};

export type LeaderboardEmailCard = {
  title: string;
  body?: string;
  imageUrl?: string;
  imageAlt?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  rows: LeaderboardEmailRow[];
  footer?: string;
  preheader?: string;
  brandName?: string;
  /** Section heading above the ranked list. */
  boardTitle?: string;
};

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

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

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '0m';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

function rankBadgeStyle(rank: number): { bg: string; color: string } {
  if (rank === 1) return { bg: '#ffc800', color: '#3c3c3c' };
  if (rank === 2) return { bg: '#e5e5e5', color: '#3c3c3c' };
  if (rank === 3) return { bg: '#ff9600', color: '#ffffff' };
  return { bg: '#f0f0f0', color: '#777777' };
}

function buildRowHtml(row: LeaderboardEmailRow): string {
  const name = escapeHtml(row.name || 'Player');
  const mins = escapeHtml(formatMinutes(row.minutes));
  const you = Boolean(row.isYou);
  const badge = rankBadgeStyle(row.rank);
  const rowBg = you ? '#ddf4ff' : '#ffffff';
  const nameColor = you ? '#1cb0f6' : '#3c3c3c';
  const youTag = you
    ? `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;
         background:#1cb0f6;color:#ffffff;font-size:10px;font-weight:800;
         letter-spacing:0.04em;vertical-align:middle;">YOU</span>`
    : '';

  return `<tr>
    <td style="padding:10px 12px;background:${rowBg};border-bottom:1px solid #f0f0f0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="40" valign="middle">
            <div style="width:32px;height:32px;border-radius:50%;background:${badge.bg};
                        line-height:32px;text-align:center;font-family:${SANS};
                        font-size:13px;font-weight:800;color:${badge.color};">
              ${row.rank}
            </div>
          </td>
          <td valign="middle" style="padding-left:8px;font-family:${SANS};font-size:15px;
                                     font-weight:700;color:${nameColor};text-align:left;">
            ${name}${youTag}
          </td>
          <td valign="middle" align="right"
              style="font-family:${SANS};font-size:14px;font-weight:800;color:#3c3c3c;
                     white-space:nowrap;">
            ${mins}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function buildGapHtml(): string {
  return `<tr>
    <td align="center" style="padding:8px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;
                               font-family:${SANS};font-size:16px;font-weight:800;color:#afafaf;
                               letter-spacing:0.2em;">
      ···
    </td>
  </tr>`;
}

function buildBoardHtml(
  rows: LeaderboardEmailRow[],
  boardTitle: string,
): string {
  if (!rows?.length) return '';

  const list = rows
    .map((row) => `${row.gapBefore ? buildGapHtml() : ''}${buildRowHtml(row)}`)
    .join('');

  return `
    <tr>
      <td align="center" style="padding:36px 0 0 0;">
        <p style="margin:0 0 16px;font-family:${SANS};font-size:20px;font-weight:800;color:#3c3c3c;">
          ${escapeHtml(boardTitle)}
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="border:2px solid #e5e5e5;border-radius:16px;overflow:hidden;">
          ${list}
        </table>
      </td>
    </tr>`;
}

/** Flat white leaderboard email — same family as streak update (no card chrome). */
export function buildLeaderboardEmailHtml(card: LeaderboardEmailCard): string {
  const brand = escapeHtml(card.brandName ?? 'pomopal');
  const title = escapeHtml(stripHtml(card.title));
  const bodyPlain = card.body ? stripHtml(card.body) : '';
  const body = bodyPlain ? escapeHtml(bodyPlain).replace(/\n/g, '<br>') : '';
  const footer =
    card.footer ?? 'Climb the board with another pomodoro!';
  const preheader =
    card.preheader ??
    `${stripHtml(card.title)} — ${stripPlain(footer)}`.slice(0, 100);
  const ctaLabel = escapeHtml(card.ctaLabel ?? 'VIEW LEADERBOARD');
  const ctaUrl = card.ctaUrl ?? 'https://pomopal.lol';
  const boardTitle = card.boardTitle ?? "This week's leaderboard";

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
        <td align="center" style="padding:8px 0 28px 0;font-size:64px;line-height:1;">👑</td>
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

          ${buildBoardHtml(card.rows, boardTitle)}

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

export function buildLeaderboardEmailText(card: LeaderboardEmailCard): string {
  const board = (card.rows ?? [])
    .map(
      (r) =>
        `#${r.rank} ${r.name}${r.isYou ? ' (you)' : ''} — ${formatMinutes(r.minutes)}`,
    )
    .join('\n');
  return [
    card.title,
    card.body ?? '',
    '',
    card.boardTitle ?? "This week's leaderboard",
    board,
    '',
    card.footer ?? 'Climb the board with another pomodoro!',
    card.ctaUrl ? `${card.ctaLabel ?? 'View leaderboard'}: ${card.ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Sample rows for admin preview / offline scripts (top 5 + you outside). */
export const SAMPLE_LEADERBOARD_ROWS: LeaderboardEmailRow[] = [
  { rank: 1, name: 'Maya', minutes: 310 },
  { rank: 2, name: 'Alex', minutes: 265 },
  { rank: 3, name: 'Sam', minutes: 240 },
  { rank: 4, name: 'Jordan', minutes: 198 },
  { rank: 5, name: 'Riley', minutes: 175 },
  { rank: 15, name: 'You', minutes: 95, isYou: true, gapBefore: true },
];
