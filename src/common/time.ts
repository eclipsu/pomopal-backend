import { toZonedTime, format } from 'date-fns-tz';

export function toUserDate(date: Date, tz: string): string {
  const zoned = toZonedTime(date, tz);
  return format(zoned, 'yyyy-MM-dd', { timeZone: tz });
}

export function todayInTz(tz: string): string {
  return toUserDate(new Date(), tz);
}

export function yesterdayInTz(tz: string): string {
  const zoned = toZonedTime(new Date(), tz);
  zoned.setDate(zoned.getDate() - 1);
  return format(zoned, 'yyyy-MM-dd', { timeZone: tz });
}
