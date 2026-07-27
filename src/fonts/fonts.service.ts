import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { FontLibrary } from '../entities/font-library.entity';
import { User } from '../entities/user.entity';
import { StorageService, getMaxFontBytes } from '../storage/storage.service';
import {
  displayNameFromFile,
  sanitizeDisplayName,
} from '../admin/image-library.util';
import { UpdateFontDto } from './dto/update-font.dto';
import { customFontToken, fontFamilyFromId } from './font.util';

export interface PublicFontDto {
  id: string;
  name: string;
  family_name: string;
  /** Dropdown / layout token: font:{uuid} */
  token: string;
  url: string;
  sort_order: number;
}

export interface FontDto extends PublicFontDto {
  active: boolean;
  s3_key: string;
  created_by_email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FontUploadTargetDto {
  key: string;
  uploadUrl: string;
  maxBytes: number;
}

@Injectable()
export class FontsService {
  constructor(
    @InjectRepository(FontLibrary)
    private readonly fonts: Repository<FontLibrary>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly storage: StorageService,
  ) {}

  async findPublicLibrary(): Promise<PublicFontDto[]> {
    const rows = await this.fonts.find({
      where: { active: true },
      order: { sort_order: 'ASC', created_at: 'ASC' },
    });
    return rows.map((row) => this.toPublicDto(row));
  }

  async findAllAdmin(): Promise<FontDto[]> {
    const rows = await this.fonts.find({
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async findOneAdmin(id: string): Promise<FontDto> {
    const font = await this.fonts.findOne({ where: { id } });
    if (!font) throw new NotFoundException('Font not found');
    return this.toDto(font);
  }

  /** Active library row by id, or null. */
  async findActiveById(id: string): Promise<FontLibrary | null> {
    return this.fonts.findOne({ where: { id, active: true } });
  }

  async createUploadTarget(mimetype: string): Promise<FontUploadTargetDto> {
    if (!mimetype?.trim()) {
      throw new BadRequestException('Font MIME type is required');
    }
    return this.storage.createFontUploadTarget(mimetype.trim());
  }

  async upload(
    file: Express.Multer.File,
    adminUserId?: string,
    requestedName?: string,
  ): Promise<FontDto> {
    if (!file) throw new BadRequestException('Font file is required');

    const s3_key = await this.storage.saveFontFile(file);
    const id = randomUUID();

    let name: string;
    try {
      name = requestedName?.trim()
        ? sanitizeDisplayName(requestedName)
        : displayNameFromFile(file);
    } catch {
      throw new BadRequestException('Invalid font name');
    }

    const font = this.fonts.create({
      id,
      name,
      family_name: fontFamilyFromId(id),
      s3_key,
      active: true,
      sort_order: await this.nextSortOrder(),
      created_by_email: await this.adminEmail(adminUserId),
    });

    return this.toDto(await this.fonts.save(font));
  }

  async completeUpload(
    key: string,
    adminUserId?: string,
    requestedName?: string,
  ): Promise<FontDto> {
    if (!key || !this.storage.isValidFontKey(key)) {
      throw new BadRequestException('Invalid uploaded font key');
    }

    const meta = await this.storage.getFontObjectMeta(key);
    if (!meta) {
      throw new BadRequestException('Uploaded font file was not found');
    }
    if (meta.size <= 0) {
      throw new BadRequestException('Uploaded font is empty');
    }
    const maxBytes = getMaxFontBytes();
    if (meta.size > maxBytes) {
      await this.storage.deleteFontFile(key);
      throw new BadRequestException(
        `Font must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`,
      );
    }

    const id = randomUUID();
    let name: string;
    try {
      name = requestedName?.trim()
        ? sanitizeDisplayName(requestedName)
        : key.split('/').pop()?.replace(/\.[^.]+$/, '') || 'font';
    } catch {
      throw new BadRequestException('Invalid font name');
    }

    const font = this.fonts.create({
      id,
      name,
      family_name: fontFamilyFromId(id),
      s3_key: key,
      active: true,
      sort_order: await this.nextSortOrder(),
      created_by_email: await this.adminEmail(adminUserId),
    });

    return this.toDto(await this.fonts.save(font));
  }

  async update(id: string, dto: UpdateFontDto): Promise<FontDto> {
    const font = await this.fonts.findOne({ where: { id } });
    if (!font) throw new NotFoundException('Font not found');

    if (dto.name !== undefined) {
      try {
        font.name = sanitizeDisplayName(dto.name);
      } catch {
        throw new BadRequestException('Invalid font name');
      }
    }
    if (dto.active !== undefined) font.active = dto.active;
    if (dto.sort_order !== undefined) font.sort_order = dto.sort_order;

    return this.toDto(await this.fonts.save(font));
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const font = await this.fonts.findOne({ where: { id } });
    if (!font) throw new NotFoundException('Font not found');

    const { s3_key } = font;
    await this.fonts.remove(font);
    await this.storage.deleteFontFile(s3_key);

    return { deleted: true };
  }

  async findPublicFontFile(
    id: string,
  ): Promise<{ buffer: Buffer; contentType: string; version: number }> {
    const font = await this.fonts.findOne({ where: { id, active: true } });
    if (!font) throw new NotFoundException('Font not found');
    const file = await this.storage.getFontBuffer(font.s3_key);
    if (!file) throw new NotFoundException('Font file not found');
    return {
      buffer: file.buffer,
      contentType: file.contentType,
      version: font.updated_at.getTime(),
    };
  }

  /** Serve the immutable per-space baked TTF copy. */
  async findBakedFontFile(
    spaceId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const key = this.storage.bakedFontKey(spaceId);
    const file = await this.storage.getFontBuffer(key);
    if (!file) throw new NotFoundException('Baked font not found');
    return file;
  }

  private async nextSortOrder(): Promise<number> {
    const maxOrder = await this.fonts
      .createQueryBuilder('f')
      .select('COALESCE(MAX(f.sort_order), -1)', 'max')
      .getRawOne<{ max: string }>();
    return Number(maxOrder?.max ?? -1) + 1;
  }

  private async adminEmail(adminUserId?: string): Promise<string | null> {
    if (!adminUserId) return null;
    const admin = await this.users.findOne({
      where: { id: adminUserId },
      select: ['email'],
    });
    return admin?.email ?? null;
  }

  private toPublicDto(font: FontLibrary): PublicFontDto {
    const v = font.updated_at.getTime();
    // Same-origin API path — browsers block cross-origin S3 @font-face without CORS.
    return {
      id: font.id,
      name: font.name,
      family_name: font.family_name,
      token: customFontToken(font.id),
      url: `/fonts/library/${font.id}/file?v=${v}`,
      sort_order: font.sort_order,
    };
  }

  private toDto(font: FontLibrary): FontDto {
    return {
      ...this.toPublicDto(font),
      active: font.active,
      s3_key: font.s3_key,
      created_by_email: font.created_by_email,
      created_at: font.created_at,
      updated_at: font.updated_at,
    };
  }
}
