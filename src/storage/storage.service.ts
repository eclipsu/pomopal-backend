import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
]);

const MAX_BYTES = 5 * 1024 * 1024;
/** ~3h MP3 at ~320 kbps; override with SOUND_MAX_AUDIO_BYTES (bytes). */
const MAX_AUDIO_BYTES = Math.max(
  50 * 1024 * 1024,
  Number(process.env.SOUND_MAX_AUDIO_BYTES || 500 * 1024 * 1024) ||
    500 * 1024 * 1024,
);
const SOUND_UPLOAD_URL_TTL_SEC = 2 * 60 * 60; // 2h for large uploads

export function getMaxAudioBytes(): number {
  return MAX_AUDIO_BYTES;
}
const TEMPLATE_PREFIX = 'notification-templates/';
const SPACE_BG_PREFIX = 'spaces/backgrounds/';
const AVATAR_PREFIX = 'avatars/';
const SOUND_BACKGROUND_PREFIX = 'sounds/background/';
const SOUND_RING_PREFIX = 'sounds/ring/';
const FONT_PREFIX = 'fonts/';
const SPACE_BAKED_FONT_PREFIX = 'spaces/baked/';
const TEMPLATE_KEY_PATTERN =
  /^notification-templates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;
const SPACE_BG_KEY_PATTERN =
  /^spaces\/backgrounds\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|gif)$/i;
const AVATAR_KEY_PATTERN =
  /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;
const SOUND_KEY_PATTERN =
  /^sounds\/(background|ring)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|m4a|aac|wav|ogg|webm)$/i;
const FONT_KEY_PATTERN =
  /^fonts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.ttf$/i;
const SPACE_BAKED_FONT_KEY_PATTERN =
  /^spaces\/baked\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/font\.ttf$/i;

const ALLOWED_FONT_MIMES = new Set([
  'font/ttf',
  'font/sfnt',
  'application/x-font-ttf',
  'application/font-sfnt',
  'application/octet-stream',
]);

/** ~10 MB — typical TTFs are much smaller. */
const MAX_FONT_BYTES = Math.max(
  1 * 1024 * 1024,
  Number(process.env.FONT_MAX_BYTES || 10 * 1024 * 1024) || 10 * 1024 * 1024,
);
const FONT_UPLOAD_URL_TTL_SEC = 30 * 60;

export function getMaxFontBytes(): number {
  return MAX_FONT_BYTES;
}

type SoundType = 'background' | 'ring';

function trimEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/^['"]|['"]$/g, '');
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const region = trimEnv(process.env.BUCKET_REGION);
    const bucket = trimEnv(process.env.BUCKET_NAME);
    if (!region || !bucket) {
      throw new Error('BUCKET_REGION and BUCKET_NAME must be set');
    }
    this.bucket = bucket;
    const accessKeyId = trimEnv(process.env.AWS_ACCESS_KEY_ID);
    const secretAccessKey = trimEnv(process.env.AWS_SECRET_ACCESS_KEY);
    this.client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  templateKey(templateId: string): string {
    return `${TEMPLATE_PREFIX}${templateId}.webp`;
  }

  isValidTemplateImageKey(key: string): boolean {
    return TEMPLATE_KEY_PATTERN.test(key);
  }

  isValidSpaceBackgroundKey(key: string): boolean {
    return SPACE_BG_KEY_PATTERN.test(key);
  }

  isValidAvatarKey(key: string): boolean {
    return AVATAR_KEY_PATTERN.test(key);
  }

  isValidSoundKey(key: string): boolean {
    return SOUND_KEY_PATTERN.test(key);
  }

  isValidFontKey(key: string): boolean {
    return FONT_KEY_PATTERN.test(key);
  }

  isValidBakedFontKey(key: string): boolean {
    return SPACE_BAKED_FONT_KEY_PATTERN.test(key);
  }

  soundPrefix(type: SoundType): string {
    return type === 'ring' ? SOUND_RING_PREFIX : SOUND_BACKGROUND_PREFIX;
  }

  bakedFontKey(spaceId: string): string {
    return `${SPACE_BAKED_FONT_PREFIX}${spaceId}/font.ttf`;
  }

  private assertAllowedFontMime(mimetype: string, filename?: string): void {
    const mime = (mimetype || '').toLowerCase();
    const nameOk = /\.ttf$/i.test(filename || '');
    if (ALLOWED_FONT_MIMES.has(mime) || nameOk) return;
    throw new BadRequestException('Font must be a .ttf file');
  }

  async listS3TemplateKeys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const result = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: TEMPLATE_PREFIX,
            ContinuationToken: continuationToken,
          }),
        );
        for (const item of result.Contents ?? []) {
          if (item.Key && this.isValidTemplateImageKey(item.Key)) {
            keys.push(item.Key);
          }
        }
        continuationToken = result.NextContinuationToken;
      } while (continuationToken);
      return keys;
    } catch (err) {
      this.logger.warn(
        `S3 list failed (need s3:ListBucket): ${err instanceof Error ? err.message : err}`,
      );
      return [];
    }
  }

  async imageExists(key: string): Promise<boolean> {
    if (!this.isValidTemplateImageKey(key)) return false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async soundExists(key: string): Promise<boolean> {
    if (!this.isValidSoundKey(key)) return false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async saveSoundAudio(
    file: Express.Multer.File,
    type: SoundType,
  ): Promise<string> {
    this.assertAllowedAudioMime(file.mimetype);
    if (file.size > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        `Audio must be ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB or smaller`,
      );
    }

    const diskPath = file.path;
    const hasBuffer = Boolean(file.buffer?.length);
    if (!diskPath && !hasBuffer) {
      throw new BadRequestException('Audio upload failed — try again');
    }

    const ext = this.audioExtension(file.mimetype);
    const key = `${this.soundPrefix(type)}${randomUUID()}.${ext}`;
    const body = diskPath
      ? createReadStream(diskPath)
      : file.buffer;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: file.mimetype,
          ContentLength: file.size > 0 ? file.size : undefined,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } finally {
      if (diskPath) {
        await fs.unlink(diskPath).catch(() => undefined);
      }
    }

    this.logger.log(`Uploaded sound to s3://${this.bucket}/${key}`);
    return key;
  }

  async createSoundUploadTarget(
    type: SoundType,
    mimetype: string,
  ): Promise<{ key: string; uploadUrl: string; maxBytes: number }> {
    this.assertAllowedAudioMime(mimetype);

    const ext = this.audioExtension(mimetype);
    const key = `${this.soundPrefix(type)}${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { expiresIn: SOUND_UPLOAD_URL_TTL_SEC },
    );

    return { key, uploadUrl, maxBytes: MAX_AUDIO_BYTES };
  }

  async getSoundObjectMeta(
    key: string,
  ): Promise<{ contentType: string; size: number } | null> {
    if (!this.isValidSoundKey(key)) return null;
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentType: result.ContentType ?? 'audio/mpeg',
        size: Number(result.ContentLength ?? 0),
      };
    } catch (err) {
      this.logger.warn(
        `Failed to read sound metadata ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async deleteSoundAudio(key: string | null | undefined): Promise<void> {
    if (!key || !this.isValidSoundKey(key)) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to delete S3 sound ${key}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async saveFontFile(file: Express.Multer.File): Promise<string> {
    this.assertAllowedFontMime(file.mimetype, file.originalname);
    if (file.size > MAX_FONT_BYTES) {
      throw new BadRequestException(
        `Font must be ${Math.round(MAX_FONT_BYTES / (1024 * 1024))} MB or smaller`,
      );
    }

    const diskPath = file.path;
    const hasBuffer = Boolean(file.buffer?.length);
    if (!diskPath && !hasBuffer) {
      throw new BadRequestException('Font upload failed — try again');
    }

    const key = `${FONT_PREFIX}${randomUUID()}.ttf`;
    const body = diskPath ? createReadStream(diskPath) : file.buffer;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: 'font/ttf',
          ContentLength: file.size > 0 ? file.size : undefined,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } finally {
      if (diskPath) {
        await fs.unlink(diskPath).catch(() => undefined);
      }
    }

    this.logger.log(`Uploaded font to s3://${this.bucket}/${key}`);
    return key;
  }

  async createFontUploadTarget(
    mimetype: string,
  ): Promise<{ key: string; uploadUrl: string; maxBytes: number }> {
    this.assertAllowedFontMime(mimetype, 'font.ttf');

    const key = `${FONT_PREFIX}${randomUUID()}.ttf`;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'font/ttf',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { expiresIn: FONT_UPLOAD_URL_TTL_SEC },
    );

    return { key, uploadUrl, maxBytes: MAX_FONT_BYTES };
  }

  async getFontObjectMeta(
    key: string,
  ): Promise<{ contentType: string; size: number } | null> {
    if (!this.isValidFontKey(key) && !this.isValidBakedFontKey(key)) {
      return null;
    }
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentType: result.ContentType ?? 'font/ttf',
        size: Number(result.ContentLength ?? 0),
      };
    } catch (err) {
      this.logger.warn(
        `Failed to read font metadata ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async deleteFontFile(key: string | null | undefined): Promise<void> {
    if (
      !key ||
      (!this.isValidFontKey(key) && !this.isValidBakedFontKey(key))
    ) {
      return;
    }

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to delete S3 font ${key}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getFontBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.isValidFontKey(key) && !this.isValidBakedFontKey(key)) {
      return null;
    }
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return {
        buffer: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType ?? 'font/ttf',
      };
    } catch (err) {
      this.logger.warn(
        `Failed to read font ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Copy a library TTF into an immutable per-space bake key so the space
   * keeps working forever even if the library font is later deleted.
   */
  async copyFontToBakedSpace(
    sourceKey: string,
    spaceId: string,
  ): Promise<string | null> {
    if (!this.isValidFontKey(sourceKey)) return null;
    const destKey = this.bakedFontKey(spaceId);

    try {
      const src = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: sourceKey }),
      );
      if (!src.Body) return null;
      const buffer = Buffer.from(await src.Body.transformToByteArray());
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: destKey,
          Body: buffer,
          ContentType: 'font/ttf',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return destKey;
    } catch (err) {
      this.logger.warn(
        `Failed to bake font for space ${spaceId}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async saveTemplateImage(file: Express.Multer.File): Promise<string> {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Image must be JPEG, PNG, WebP, or GIF');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Image upload failed — try again');
    }

    const key = `${TEMPLATE_PREFIX}${randomUUID()}.webp`;
    const body = await sharp(file.buffer).rotate().webp({ quality: 85 }).toBuffer();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    this.logger.log(`Uploaded template image to s3://${this.bucket}/${key}`);
    return key;
  }

  /**
   * User space background. Stills are converted to WebP; GIFs are stored as-is
   * so animation is preserved.
   */
  async saveSpaceBackground(file: Express.Multer.File): Promise<string> {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Image must be JPEG, PNG, WebP, or GIF');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Image upload failed — try again');
    }

    const isGif = file.mimetype === 'image/gif';
    const key = `${SPACE_BG_PREFIX}${randomUUID()}.${isGif ? 'gif' : 'webp'}`;
    const body = isGif
      ? file.buffer
      : await sharp(file.buffer)
          .rotate()
          .resize({
            width: 3840,
            height: 2160,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: isGif ? 'image/gif' : 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    this.logger.log(`Uploaded space background to s3://${this.bucket}/${key}`);
    return key;
  }

  /**
   * User profile photo — always square WebP for consistent avatars.
   * Returns the S3 object key (store public URL on the user row).
   */
  async saveUserAvatar(file: Express.Multer.File): Promise<string> {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Image must be JPEG, PNG, WebP, or GIF');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Image upload failed — try again');
    }

    const key = `${AVATAR_PREFIX}${randomUUID()}.webp`;
    const body = await sharp(file.buffer)
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    this.logger.log(`Uploaded avatar to s3://${this.bucket}/${key}`);
    return key;
  }

  /** True when avatar_url points at one of our S3 avatar objects (safe to delete). */
  isManagedAvatarUrl(stored: string | null | undefined): boolean {
    if (!stored) return false;
    if (this.isValidAvatarKey(stored)) return true;
    try {
      const parsed = new URL(stored);
      const key = parsed.pathname.replace(/^\//, '');
      return this.isValidAvatarKey(key);
    } catch {
      return false;
    }
  }

  async deleteStoredImage(stored: string | null | undefined): Promise<void> {
    const key = this.resolveKey(stored);
    if (!key) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to delete S3 object ${key}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  objectPublicUrl(key: string): string {
    const region = process.env.BUCKET_REGION ?? 'us-east-1';
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  async getSoundAudioBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.isValidSoundKey(key)) return null;

    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return {
        buffer: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType ?? 'audio/mpeg',
      };
    } catch (err) {
      this.logger.warn(
        `Failed to read sound ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Stream a sound from S3 with optional HTTP Range support for progressive
   * `<audio>` playback (needed for multi-hour files).
   */
  async getSoundAudioStream(
    key: string,
    rangeHeader?: string,
  ): Promise<{
    body: Readable;
    contentType: string;
    contentLength?: number;
    contentRange?: string;
    statusCode: number;
  } | null> {
    if (!this.isValidSoundKey(key)) return null;

    try {
      const input: {
        Bucket: string;
        Key: string;
        Range?: string;
      } = { Bucket: this.bucket, Key: key };
      if (rangeHeader?.startsWith('bytes=')) {
        input.Range = rangeHeader;
      }

      const result = await this.client.send(new GetObjectCommand(input));
      if (!result.Body) return null;

      const body = result.Body as Readable;
      return {
        body,
        contentType: result.ContentType ?? 'audio/mpeg',
        contentLength:
          typeof result.ContentLength === 'number'
            ? result.ContentLength
            : undefined,
        contentRange: result.ContentRange ?? undefined,
        statusCode: result.ContentRange ? 206 : 200,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to stream sound ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async getObjectBuffer(
    stored: string | null | undefined,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const key = this.resolveKey(stored);
    if (!key) return null;

    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return {
        buffer: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType ?? 'image/webp',
      };
    } catch (err) {
      this.logger.warn(
        `Failed to read S3 object ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /** Map DB value → public S3 URL for admin UI (not used in emails). */
  async resolveImageUrl(
    stored: string | null | undefined,
  ): Promise<string | null> {
    if (!stored) return null;
    if (stored.startsWith('http://') || stored.startsWith('https://')) {
      return stored;
    }
    const key = this.resolveKey(stored);
    if (!key) return null;
    return this.objectPublicUrl(key);
  }

  resolveKeyForReuse(stored: string | null | undefined): string | null {
    return this.resolveKey(stored);
  }

  private resolveKey(stored: string | null | undefined): string | null {
    if (!stored) return null;
    if (stored.startsWith(TEMPLATE_PREFIX)) return stored;
    if (stored.startsWith(SPACE_BG_PREFIX)) return stored;
    if (stored.startsWith(AVATAR_PREFIX)) return stored;
    if (stored.startsWith('/storage/templates/')) {
      const filename = stored.replace('/storage/templates/', '');
      return `${TEMPLATE_PREFIX}${filename}`;
    }
    try {
      const url = new URL(stored);
      const key = this.keyFromUrlPath(url.pathname);
      if (key) return key;
    } catch {
      // not a URL
    }
    return null;
  }

  private keyFromUrlPath(pathname: string): string | null {
    const path = pathname.replace(/^\//, '').replace(/^(api\/)?media\//, '');
    if (path.startsWith(TEMPLATE_PREFIX)) return path;
    if (path.startsWith(SPACE_BG_PREFIX)) return path;
    if (path.startsWith(AVATAR_PREFIX)) return path;
    if (path.startsWith('sounds/')) return path;
    const legacy = path.match(/^storage\/templates\/(.+)$/);
    if (legacy) return `${TEMPLATE_PREFIX}${legacy[1]}`;
    return null;
  }

  private audioExtension(mimetype: string): string {
    switch (mimetype) {
      case 'audio/mp4':
      case 'audio/x-m4a':
        return 'm4a';
      case 'audio/aac':
      case 'audio/x-aac':
        return 'aac';
      case 'audio/wav':
      case 'audio/x-wav':
        return 'wav';
      case 'audio/ogg':
        return 'ogg';
      case 'audio/webm':
        return 'webm';
      default:
        return 'mp3';
    }
  }

  private assertAllowedAudioMime(mimetype: string): void {
    if (!ALLOWED_AUDIO_MIMES.has(mimetype)) {
      throw new BadRequestException(
        'Audio must be MP3, M4A, AAC, WAV, OGG, or WebM',
      );
    }
  }
}
