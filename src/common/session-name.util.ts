import { createHash } from 'crypto';

const DEFAULT_SESSION_NAME = 'Untitled Session';

/** Display name: trimmed, max 80, fallback default. */
export function normalizeSessionName(name?: string | null): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed.slice(0, 80) || DEFAULT_SESSION_NAME;
}

/**
 * Analytics key: lowercase + collapse whitespace, then sha256.
 * "Write Essay" / "write  essay" / "WRITE ESSAY" → same hash.
 */
export function hashSessionName(name?: string | null): string {
  const display = normalizeSessionName(name);
  const key = display.toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(key, 'utf8').digest('hex');
}
