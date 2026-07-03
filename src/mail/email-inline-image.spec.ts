import {
  fetchUrlAsInlineImage,
  NOTIFICATION_IMAGE_CID,
  resolveInlineEmailImage,
} from './email-inline-image';

describe('email-inline-image', () => {
  it('embeds image bytes from storage loader', async () => {
    const payload = await resolveInlineEmailImage(
      'notification-templates/abc.webp',
      async () => ({
        buffer: Buffer.from('webp-bytes'),
        contentType: 'image/webp',
      }),
    );

    expect(payload.inlineImage?.cid).toBe(NOTIFICATION_IMAGE_CID);
    expect(payload.inlineImage?.content.toString()).toBe('webp-bytes');
    expect(payload.imageUrl).toBeUndefined();
  });

  it('falls back to public URL when storage and fetch both fail', async () => {
    const payload = await resolveInlineEmailImage(
      'https://example.com/missing.png',
      async () => null,
    );

    expect(payload.inlineImage).toBeUndefined();
    expect(payload.imageUrl).toBe('https://example.com/missing.png');
  });

  it('falls back to publicUrlForKey when storage read fails', async () => {
    const key = 'notification-templates/abc.webp';
    const payload = await resolveInlineEmailImage(key, async () => null, {
      publicUrlForKey: (k) => `https://bucket.s3.amazonaws.com/${k}`,
    });

    expect(payload.inlineImage).toBeUndefined();
    expect(payload.imageUrl).toBeUndefined();
  });

  it('fetchUrlAsInlineImage returns null on failed fetch', async () => {
    const result = await fetchUrlAsInlineImage('https://example.invalid/nope.png');
    expect(result).toBeNull();
  });
});
