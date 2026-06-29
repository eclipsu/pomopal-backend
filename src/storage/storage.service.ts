import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class StorageService {
  private readonly templatesDir = join(process.cwd(), 'storage', 'templates');

  async saveTemplateImage(
    file: Express.Multer.File,
    templateId: string,
  ): Promise<string> {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Image must be JPEG, PNG, WebP, or GIF');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }

    await mkdir(this.templatesDir, { recursive: true });
    const filename = `${templateId}.webp`;
    const outPath = join(this.templatesDir, filename);

    await sharp(file.buffer).rotate().webp({ quality: 85 }).toFile(outPath);

    return `/storage/templates/${filename}`;
  }

  async deleteByUrl(imageUrl: string | null | undefined): Promise<void> {
    if (!imageUrl?.startsWith('/storage/templates/')) return;
    const filePath = join(process.cwd(), imageUrl);
    await unlink(filePath).catch(() => undefined);
  }
}
