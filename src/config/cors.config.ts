const DEFAULT_ORIGINS = [
  'https://pomopal.lol',
  'https://www.pomopal.lol',
  'https://pomopal.vercel.app',
  'http://localhost:3000',
];

const POMOPAL_ORIGIN = /^https:\/\/([\w-]+\.)?pomopal\.lol$/;

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowed = [...DEFAULT_ORIGINS, ...extra];
  if (allowed.includes(origin)) return true;

  return POMOPAL_ORIGIN.test(origin);
}

export function getCorsOriginConfig():
  | boolean
  | string[]
  | ((
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void) {
  return (origin, callback) => {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  };
}
