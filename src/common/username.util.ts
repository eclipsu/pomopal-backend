const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'contact',
  'friends',
  'login',
  'me',
  'null',
  'privacy',
  'register',
  'settings',
  'spaces',
  'success',
  'undefined',
  'u',
  'user',
  'users',
  'www',
]);

/**
 * First name only, all lowercase letters (a–z).
 * "Rajeev Kumar" → "rajeev"
 */
export function firstNameUsername(input: string): string {
  const first = (input || '').trim().split(/\s+/)[0] || '';
  return first
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 32);
}

/** Normalize user input to firstname-style handle. */
export function slugifyUsername(input: string): string {
  return firstNameUsername(input);
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

/** Usernames are firstname-only: 3–32 lowercase letters. */
export function isValidUsername(username: string): boolean {
  return (
    /^[a-z]{3,32}$/.test(username) && !isReservedUsername(username)
  );
}

/** System allocation may append digits when the firstname is taken. */
export function isAllocatableUsername(username: string): boolean {
  return (
    /^[a-z]{3,28}\d{0,4}$/.test(username) &&
    username.length >= 3 &&
    username.length <= 32 &&
    !isReservedUsername(username.replace(/\d+$/, '') || username)
  );
}

export function slugifyTitleForPath(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return base || 'space';
}
