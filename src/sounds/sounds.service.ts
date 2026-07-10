import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  SoundLibrary,
  type SoundType,
} from '../entities/sound-library.entity';
import { User } from '../entities/user.entity';
import { StorageService } from '../storage/storage.service';
import {
  displayNameFromFile,
  sanitizeDisplayName,
} from '../admin/image-library.util';
import { UpdateSoundDto } from './dto/update-sound.dto';

export interface SoundDto {
  id: string;
  name: string;
  type: SoundType;
  url: string;
  active: boolean;
  sort_order: number;
  s3_key: string;
  created_by_email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicSoundDto {
  id: string;
  name: string;
  type: SoundType;
  url: string;
  sort_order: number;
}

export interface SoundUploadTargetDto {
  key: string;
  uploadUrl: string;
}

@Injectable()
export class SoundsService {
  constructor(
    @InjectRepository(SoundLibrary)
    private readonly sounds: Repository<SoundLibrary>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly storage: StorageService,
  ) {}

  async findPublicLibrary(type?: SoundType): Promise<PublicSoundDto[]> {
    const where = type ? { type, active: true } : { active: true };
    const rows = await this.sounds.find({
      where,
      order: { sort_order: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => this.toPublicDto(row));
  }

  async findAllAdmin(type?: SoundType): Promise<SoundDto[]> {
    const where = type ? { type } : {};
    const rows = await this.sounds.find({
      where,
      order: { type: 'ASC', sort_order: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async findOneAdmin(id: string): Promise<SoundDto> {
    const sound = await this.sounds.findOne({ where: { id } });
    if (!sound) throw new NotFoundException('Sound not found');
    return this.toDto(sound);
  }

  async upload(
    file: Express.Multer.File,
    type: SoundType,
    adminUserId?: string,
    requestedName?: string,
  ): Promise<SoundDto> {
    if (!file) {
      throw new BadRequestException('Audio file is required');
    }
    if (type !== 'background' && type !== 'ring') {
      throw new BadRequestException('Type must be background or ring');
    }

    const s3_key = await this.storage.saveSoundAudio(file, type);

    let name: string;
    try {
      name = requestedName?.trim()
        ? sanitizeDisplayName(requestedName)
        : displayNameFromFile(file);
    } catch {
      throw new BadRequestException('Invalid sound name');
    }

    let created_by_email: string | null = null;
    if (adminUserId) {
      const admin = await this.users.findOne({
        where: { id: adminUserId },
        select: ['email'],
      });
      created_by_email = admin?.email ?? null;
    }

    const maxOrder = await this.sounds
      .createQueryBuilder('s')
      .select('COALESCE(MAX(s.sort_order), -1)', 'max')
      .where('s.type = :type', { type })
      .getRawOne<{ max: string }>();

    const sound = this.sounds.create({
      id: randomUUID(),
      name,
      type,
      s3_key,
      active: true,
      sort_order: Number(maxOrder?.max ?? -1) + 1,
      created_by_email,
    });

    return this.toDto(await this.sounds.save(sound));
  }

  async createUploadTarget(
    type: SoundType,
    mimetype: string,
  ): Promise<SoundUploadTargetDto> {
    if (type !== 'background' && type !== 'ring') {
      throw new BadRequestException('Type must be background or ring');
    }
    if (!mimetype?.trim()) {
      throw new BadRequestException('Audio MIME type is required');
    }
    return this.storage.createSoundUploadTarget(type, mimetype.trim());
  }

  async completeUpload(
    key: string,
    type: SoundType,
    adminUserId?: string,
    requestedName?: string,
  ): Promise<SoundDto> {
    if (!key || !this.storage.isValidSoundKey(key)) {
      throw new BadRequestException('Invalid uploaded sound key');
    }
    if (type !== 'background' && type !== 'ring') {
      throw new BadRequestException('Type must be background or ring');
    }

    const meta = await this.storage.getSoundObjectMeta(key);
    if (!meta) {
      throw new BadRequestException('Uploaded audio file was not found');
    }
    if (meta.size <= 0) {
      throw new BadRequestException('Uploaded audio is empty');
    }
    if (meta.size > 50 * 1024 * 1024) {
      await this.storage.deleteSoundAudio(key);
      throw new BadRequestException('Audio must be 50 MB or smaller');
    }

    let name: string;
    try {
      name = requestedName?.trim()
        ? sanitizeDisplayName(requestedName)
        : key.split('/').pop()?.replace(/\.[^.]+$/, '') || 'sound';
    } catch {
      throw new BadRequestException('Invalid sound name');
    }

    let created_by_email: string | null = null;
    if (adminUserId) {
      const admin = await this.users.findOne({
        where: { id: adminUserId },
        select: ['email'],
      });
      created_by_email = admin?.email ?? null;
    }

    const maxOrder = await this.sounds
      .createQueryBuilder('s')
      .select('COALESCE(MAX(s.sort_order), -1)', 'max')
      .where('s.type = :type', { type })
      .getRawOne<{ max: string }>();

    const sound = this.sounds.create({
      id: randomUUID(),
      name,
      type,
      s3_key: key,
      active: true,
      sort_order: Number(maxOrder?.max ?? -1) + 1,
      created_by_email,
    });

    return this.toDto(await this.sounds.save(sound));
  }

  async update(id: string, dto: UpdateSoundDto): Promise<SoundDto> {
    const sound = await this.sounds.findOne({ where: { id } });
    if (!sound) throw new NotFoundException('Sound not found');

    if (dto.name !== undefined) {
      try {
        sound.name = sanitizeDisplayName(dto.name);
      } catch {
        throw new BadRequestException('Invalid sound name');
      }
    }
    if (dto.active !== undefined) sound.active = dto.active;
    if (dto.sort_order !== undefined) sound.sort_order = dto.sort_order;

    return this.toDto(await this.sounds.save(sound));
  }

  async findPublicSoundFile(
    id: string,
  ): Promise<{ buffer: Buffer; contentType: string; version: number }> {
    const sound = await this.sounds.findOne({ where: { id, active: true } });
    if (!sound) throw new NotFoundException('Sound not found');

    const file = await this.storage.getSoundAudioBuffer(sound.s3_key);
    if (!file) throw new NotFoundException('Sound file not found');

    return {
      buffer: file.buffer,
      contentType: file.contentType,
      version: sound.updated_at.getTime(),
    };
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const sound = await this.sounds.findOne({ where: { id } });
    if (!sound) throw new NotFoundException('Sound not found');

    const { s3_key } = sound;
    await this.sounds.remove(sound);
    await this.storage.deleteSoundAudio(s3_key);

    return { deleted: true };
  }

  private toPublicDto(sound: SoundLibrary): PublicSoundDto {
    const base = this.storage.objectPublicUrl(sound.s3_key);
    const v = sound.updated_at.getTime();
    return {
      id: sound.id,
      name: sound.name,
      type: sound.type,
      url: `${base}?v=${v}`,
      sort_order: sound.sort_order,
    };
  }

  private toDto(sound: SoundLibrary): SoundDto {
    const base = this.storage.objectPublicUrl(sound.s3_key);
    const v = sound.updated_at.getTime();
    return {
      id: sound.id,
      name: sound.name,
      type: sound.type,
      url: `${base}?v=${v}`,
      active: sound.active,
      sort_order: sound.sort_order,
      s3_key: sound.s3_key,
      created_by_email: sound.created_by_email,
      created_at: sound.created_at,
      updated_at: sound.updated_at,
    };
  }
}
