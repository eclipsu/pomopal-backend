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
  type SoundSource,
  type SoundType,
} from '../entities/sound-library.entity';
import { User } from '../entities/user.entity';
import { StorageService, getMaxAudioBytes } from '../storage/storage.service';
import {
  displayNameFromFile,
  sanitizeDisplayName,
} from '../admin/image-library.util';
import { UpdateSoundDto } from './dto/update-sound.dto';
import {
  buildYoutubeWatchUrl,
  extractYoutubeVideoId,
} from './youtube.util';

export interface SoundDto {
  id: string;
  name: string;
  type: SoundType;
  source: SoundSource;
  url: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  active: boolean;
  sort_order: number;
  s3_key: string | null;
  created_by_email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicSoundDto {
  id: string;
  name: string;
  type: SoundType;
  source: SoundSource;
  /** S3/proxy URL for uploaded sounds; null for YouTube. */
  url: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  sort_order: number;
}

export interface SoundUploadTargetDto {
  key: string;
  uploadUrl: string;
  maxBytes: number;
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

  private async nextSortOrder(type: SoundType): Promise<number> {
    const maxOrder = await this.sounds
      .createQueryBuilder('s')
      .select('COALESCE(MAX(s.sort_order), -1)', 'max')
      .where('s.type = :type', { type })
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

  /**
   * Curate a YouTube link into the library. Stores metadata only — audio is
   * fetched on demand per client (IndexedDB cache), never uploaded to S3.
   */
  async createFromYoutube(
    url: string,
    requestedName: string,
    type: SoundType = 'background',
    adminUserId?: string,
  ): Promise<SoundDto> {
    if (type !== 'background' && type !== 'ring') {
      throw new BadRequestException('Type must be background or ring');
    }

    const videoId = extractYoutubeVideoId(url);
    if (!videoId) {
      throw new BadRequestException('Invalid YouTube URL');
    }

    let name: string;
    try {
      name = sanitizeDisplayName(requestedName);
    } catch {
      throw new BadRequestException('Invalid sound name');
    }

    const existing = await this.sounds.findOne({
      where: { type, youtube_video_id: videoId },
    });
    if (existing) {
      throw new BadRequestException(
        `This YouTube video is already in the ${type} library as "${existing.name}"`,
      );
    }

    const sound = this.sounds.create({
      id: randomUUID(),
      name,
      type,
      source: 'youtube',
      s3_key: null,
      youtube_video_id: videoId,
      active: true,
      sort_order: await this.nextSortOrder(type),
      created_by_email: await this.adminEmail(adminUserId),
    });

    return this.toDto(await this.sounds.save(sound));
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

    const sound = this.sounds.create({
      id: randomUUID(),
      name,
      type,
      source: 's3',
      s3_key,
      youtube_video_id: null,
      active: true,
      sort_order: await this.nextSortOrder(type),
      created_by_email: await this.adminEmail(adminUserId),
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
    const maxBytes = getMaxAudioBytes();
    if (meta.size > maxBytes) {
      await this.storage.deleteSoundAudio(key);
      throw new BadRequestException(
        `Audio must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`,
      );
    }

    let name: string;
    try {
      name = requestedName?.trim()
        ? sanitizeDisplayName(requestedName)
        : key.split('/').pop()?.replace(/\.[^.]+$/, '') || 'sound';
    } catch {
      throw new BadRequestException('Invalid sound name');
    }

    const sound = this.sounds.create({
      id: randomUUID(),
      name,
      type,
      source: 's3',
      s3_key: key,
      youtube_video_id: null,
      active: true,
      sort_order: await this.nextSortOrder(type),
      created_by_email: await this.adminEmail(adminUserId),
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

  /** Look up an active YouTube-backed sound for progressive streaming. */
  async getStreamableYoutube(
    id: string,
  ): Promise<{ videoId: string; name: string }> {
    const sound = await this.sounds.findOne({ where: { id, active: true } });
    if (!sound) throw new NotFoundException('Sound not found');
    if (sound.source !== 'youtube' || !sound.youtube_video_id) {
      throw new BadRequestException('This sound is not stream-backed');
    }
    return { videoId: sound.youtube_video_id, name: sound.name };
  }

  /**
   * Resolve how a public library sound should be streamed.
   * YouTube → googlevideo proxy; S3 → Range-capable object stream.
   */
  async getPublicStreamTarget(id: string): Promise<
    | { kind: 'youtube'; videoId: string; name: string }
    | { kind: 's3'; key: string; name: string }
  > {
    const sound = await this.sounds.findOne({ where: { id, active: true } });
    if (!sound) throw new NotFoundException('Sound not found');

    if (sound.source === 'youtube' && sound.youtube_video_id) {
      return {
        kind: 'youtube',
        videoId: sound.youtube_video_id,
        name: sound.name,
      };
    }

    if (sound.source === 's3' && sound.s3_key) {
      return { kind: 's3', key: sound.s3_key, name: sound.name };
    }

    throw new BadRequestException('This sound cannot be streamed');
  }

  async streamPublicS3Sound(id: string, rangeHeader?: string) {
    const target = await this.getPublicStreamTarget(id);
    if (target.kind !== 's3') {
      throw new BadRequestException('Not an S3-backed sound');
    }
    const stream = await this.storage.getSoundAudioStream(
      target.key,
      rangeHeader,
    );
    if (!stream) throw new NotFoundException('Sound file not found');
    return stream;
  }

  async findPublicSoundFile(
    id: string,
  ): Promise<{ buffer: Buffer; contentType: string; version: number }> {
    const sound = await this.sounds.findOne({ where: { id, active: true } });
    if (!sound) throw new NotFoundException('Sound not found');
    if (sound.source === 'youtube' || !sound.s3_key) {
      throw new BadRequestException(
        'This sound is YouTube-backed — clients should parse the YouTube URL',
      );
    }

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

    const { s3_key, source } = sound;
    await this.sounds.remove(sound);
    if (source === 's3' && s3_key) {
      await this.storage.deleteSoundAudio(s3_key);
    }

    return { deleted: true };
  }

  private toPublicDto(sound: SoundLibrary): PublicSoundDto {
    const source: SoundSource = sound.source || (sound.s3_key ? 's3' : 'youtube');
    if (source === 'youtube' && sound.youtube_video_id) {
      return {
        id: sound.id,
        name: sound.name,
        type: sound.type,
        source: 'youtube',
        url: null,
        youtube_url: buildYoutubeWatchUrl(sound.youtube_video_id),
        youtube_video_id: sound.youtube_video_id,
        sort_order: sound.sort_order,
      };
    }

    const key = sound.s3_key!;
    const base = this.storage.objectPublicUrl(key);
    const v = sound.updated_at.getTime();
    return {
      id: sound.id,
      name: sound.name,
      type: sound.type,
      source: 's3',
      url: `${base}?v=${v}`,
      youtube_url: null,
      youtube_video_id: null,
      sort_order: sound.sort_order,
    };
  }

  private toDto(sound: SoundLibrary): SoundDto {
    const pub = this.toPublicDto(sound);
    return {
      ...pub,
      active: sound.active,
      s3_key: sound.s3_key,
      created_by_email: sound.created_by_email,
      created_at: sound.created_at,
      updated_at: sound.updated_at,
    };
  }
}
