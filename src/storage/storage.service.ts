import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'crypto';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_BYTES = 5 * 1024 * 1024;
const TEMPLATE_PREFIX = 'notification-templates/';
const TEMPLATE_KEY_PATTERN =
  /^notification-templates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const region = process.env.BUCKET_REGION;
    const bucket = process.env.BUCKET_NAME;
    if (!region || !bucket) {
      throw new Error('BUCKET_REGION and BUCKET_NAME must be set');
    }
    this.bucket = bucket;
    this.client = new S3Client({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  templateKey(templateId: string): string {
    return `${TEMPLATE_PREFIX}${templateId}.webp`;
  }

  isValidTemplateImageKey(key: string): boolean {
    return TEMPLATE_KEY_PATTERN.test(key);
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
    const legacy = path.match(/^storage\/templates\/(.+)$/);
    if (legacy) return `${TEMPLATE_PREFIX}${legacy[1]}`;
    return null;
  }
}
