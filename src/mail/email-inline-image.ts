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

function filenameForContentType(contentType: string): string {
  if (contentType.includes('webp')) return 'notification.webp';
  if (contentType.includes('png')) return 'notification.png';
  if (contentType.includes('gif')) return 'notification.gif';
  return 'notification.jpg';
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
    return {
      cid: NOTIFICATION_IMAGE_CID,
      content,
      contentType,
      filename: filenameForContentType(contentType),
    };
  } catch {
    return null;
  }
}

export async function resolveInlineEmailImage(
  source: string | undefined,
  loadFromStorage: (
    stored: string,
  ) => Promise<{ buffer: Buffer; contentType: string } | null>,
): Promise<EmailImagePayload> {
  if (!source) return {};

  const fromStorage = await loadFromStorage(source);
  if (fromStorage) {
    return {
      inlineImage: {
        cid: NOTIFICATION_IMAGE_CID,
        content: fromStorage.buffer,
        contentType: fromStorage.contentType,
        filename: filenameForContentType(fromStorage.contentType),
      },
    };
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const inlineImage = await fetchUrlAsInlineImage(source);
    if (inlineImage) return { inlineImage };
    return { imageUrl: source };
  }

  return {};
}
