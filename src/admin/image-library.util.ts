const DISPLAY_NAME_MAX = 120;

export function sanitizeDisplayName(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/[\0\r\n]/g, '')
    .replace(/[/\\]+/g, '-')
    .slice(0, DISPLAY_NAME_MAX);
  if (!trimmed) {
    throw new Error('Display name is required');
  }
  return trimmed;
}

export function displayNameFromFile(file: Express.Multer.File): string {
  const raw = file.originalname?.trim() || 'image';
  const base = raw.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '') || 'image';
  return sanitizeDisplayName(base);
}

export function defaultNameFromKey(key: string): string {
  const stem = key
    .replace(/^notification-templates\//, '')
    .replace(/\.webp$/i, '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stem)) {
    return `Image ${stem.slice(0, 8)}`;
  }
  return sanitizeDisplayName(stem);
}
