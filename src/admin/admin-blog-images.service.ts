import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

export type BlogImageDto = {
  key: string;
  url: string;
  name: string;
};

@Injectable()
export class AdminBlogImagesService {
  constructor(private readonly storage: StorageService) {}

  async list(): Promise<BlogImageDto[]> {
    const keys = await this.storage.listS3BlogKeys();
    return keys
      .sort((a, b) => a.localeCompare(b))
      .map((key) => this.toDto(key));
  }

  async upload(
    file?: Express.Multer.File,
    name?: string,
  ): Promise<BlogImageDto> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const slug =
      name?.trim() ||
      (file.originalname || 'image')
        .replace(/\.[^.]+$/, '')
        .trim();

    if (!slug) {
      throw new BadRequestException('Image name is required');
    }

    const key = await this.storage.saveBlogImage(file, slug);
    return this.toDto(key);
  }

  async remove(key: string): Promise<{ ok: true }> {
    if (!this.storage.isValidBlogImageKey(key)) {
      throw new BadRequestException('Invalid blog image key');
    }
    const keys = await this.storage.listS3BlogKeys();
    if (!keys.includes(key)) {
      throw new NotFoundException('Blog image not found');
    }
    await this.storage.deleteStoredImage(key);
    return { ok: true };
  }

  private toDto(key: string): BlogImageDto {
    const name = key.replace(/^blog\//, '').replace(/\.webp$/i, '');
    return {
      key,
      name,
      url: this.storage.objectPublicUrl(key),
    };
  }
}
