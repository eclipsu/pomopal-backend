import sharp from 'sharp';

export const NOTIFICATION_IMAGE_CID = 'pomopal-notification-image';

export interface InlineEmailImage {
  cid: string;
  content: Buffer;
  contentType: string;
  filename: string;
}

export interface EmailImagePayload {
  inlineImage?: InlineEmailImage;
  /** Fallback when the image cannot be embedded (rare). */
  imageUrl?: string;
}

export interface ResolveInlineEmailImageOptions {
  publicUrlForKey?: (key: string) => string;
}

function filenameForContentType(contentType: string): string {
  if (contentType.includes('png')) return 'notification.png';
  if (contentType.includes('gif')) return 'notification.gif';
  if (contentType.includes('webp')) return 'notification.webp';
  return 'notification.jpg';
}

/** WebP/GIF → PNG for broader email client support (e.g. Gmail). */
export async function toEmailFriendlyImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const lower = contentType.toLowerCase();
  if (lower.includes('webp') || lower.includes('gif')) {
    try {
      const png = await sharp(buffer).png().toBuffer();
      return { buffer: png, contentType: 'image/png', filename: 'notification.png' };
    } catch {
      // keep original bytes when conversion fails (e.g. test fixtures)
    }
  }
  return {
    buffer,
    contentType,
    filename: filenameForContentType(contentType),
  };
}

async function buildInlineImage(
  buffer: Buffer,
  contentType: string,
  cid: string,
  filename?: string,
): Promise<InlineEmailImage> {
  const prepared = await toEmailFriendlyImage(buffer, contentType);
  return {
    cid,
    content: prepared.buffer,
    contentType: prepared.contentType,
    filename: filename ?? prepared.filename,
  };
}

export async function fetchUrlAsInlineImage(
  url: string,
): Promise<InlineEmailImage | null> {
  try {
    const res = await fetch(url.split('?')[0]);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/png';
    const content = Buffer.from(await res.arrayBuffer());
    if (!content.length) return null;
    return buildInlineImage(content, contentType, NOTIFICATION_IMAGE_CID);
  } catch {
    return null;
  }
}

function isHttpUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://');
}

function isTemplateKey(source: string): boolean {
  return source.startsWith('notification-templates/');
}

export async function resolveInlineEmailImage(
  source: string | undefined,
  loadFromStorage: (
    stored: string,
  ) => Promise<{ buffer: Buffer; contentType: string } | null>,
  options?: ResolveInlineEmailImageOptions,
): Promise<EmailImagePayload> {
  if (!source) return {};

  const fromStorage = await loadFromStorage(source);
  if (fromStorage) {
    return {
      inlineImage: await buildInlineImage(
        fromStorage.buffer,
        fromStorage.contentType,
        NOTIFICATION_IMAGE_CID,
      ),
    };
  }

  const urlsToTry: string[] = [];
  if (isHttpUrl(source)) {
    urlsToTry.push(source);
  } else if (isTemplateKey(source) && options?.publicUrlForKey) {
    urlsToTry.push(options.publicUrlForKey(source));
  }

  for (const url of urlsToTry) {
    const inlineImage = await fetchUrlAsInlineImage(url);
    if (inlineImage) return { inlineImage };
  }

  if (isHttpUrl(source)) {
    return { imageUrl: source.split('?')[0] };
  }

  return {};
}
