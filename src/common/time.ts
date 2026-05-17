import { toZonedTime, format } from 'date-fns-tz';

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

/** Fallback to UTC when DB has empty/invalid IANA timezone (e.g. legacy Google users). */
export function normalizeTimezone(tz?: string | null): string {
  const trimmed = tz?.trim();
  if (trimmed && VALID_TIMEZONES.has(trimmed)) {
    return trimmed;
  }
  return 'UTC';
}

export function toUserDate(date: Date, tz: string): string {
  const zone = normalizeTimezone(tz);
  if (Number.isNaN(date.getTime())) {
    return format(toZonedTime(new Date(), zone), 'yyyy-MM-dd', { timeZone: zone });
  }
  const zoned = toZonedTime(date, zone);
  return format(zoned, 'yyyy-MM-dd', { timeZone: zone });
}

export function todayInTz(tz: string): string {
  return toUserDate(new Date(), tz);
}

export function yesterdayInTz(tz: string): string {
  const zone = normalizeTimezone(tz);
  const zoned = toZonedTime(new Date(), zone);
  zoned.setDate(zoned.getDate() - 1);
  return format(zoned, 'yyyy-MM-dd', { timeZone: zone });
}

/** Parse streak `last_active_date` (date column) to YYYY-MM-DD in user's timezone. */
export function streakDateToYmd(
  lastActive: string | Date | null | undefined,
  tz: string,
): string | null {
  if (lastActive == null) return null;
  if (typeof lastActive === 'string') {
    const match = lastActive.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = lastActive instanceof Date ? lastActive : new Date(lastActive);
  if (Number.isNaN(d.getTime())) return null;
  return toUserDate(d, tz);
}
