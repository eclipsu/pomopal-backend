import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import type { AuthJwtPayload } from '../auth/types/auth-jwtPayload';
import type { SoundType } from '../entities/sound-library.entity';
import { CreateYoutubeSoundDto } from './dto/create-youtube-sound.dto';
import { UpdateSoundDto } from './dto/update-sound.dto';
import { SoundsService } from './sounds.service';
import { getMaxAudioBytes } from '../storage/storage.service';

const audioUpload = FileInterceptor('audio', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpdir()),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname || '') || '.mp3';
      cb(null, `pomopal-sound-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: getMaxAudioBytes() },
});

@Controller('admin/sounds')
@UseGuards(AdminGuard)
export class AdminSoundsController {
  constructor(private readonly sounds: SoundsService) {}

  @Get()
  list(@Query('type') type?: SoundType) {
    if (type && type !== 'background' && type !== 'ring') {
      return this.sounds.findAllAdmin();
    }
    return this.sounds.findAllAdmin(type);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.sounds.findOneAdmin(id);
  }

  /** Metadata-only: name a YouTube link for the curated library (no S3). */
  @Post('from-youtube')
  fromYoutube(
    @Body() dto: CreateYoutubeSoundDto,
    @Req() req?: { user?: AuthJwtPayload },
  ) {
    return this.sounds.createFromYoutube(
      dto.url,
      dto.name,
      dto.type ?? 'background',
      req?.user?.sub,
    );
  }

  @Post('upload-url')
  uploadUrl(
    @Body('type') type?: SoundType,
    @Body('mimetype') mimetype?: string,
  ) {
    if (!type || (type !== 'background' && type !== 'ring')) {
      throw new BadRequestException('Type must be background or ring');
    }
    if (!mimetype?.trim()) {
      throw new BadRequestException('Audio MIME type is required');
    }
    return this.sounds.createUploadTarget(type, mimetype);
  }

  @Post('upload')
  @UseInterceptors(audioUpload)
  upload(
    @UploadedFile() audio?: Express.Multer.File,
    @Body('name') name?: string,
    @Body('type') type?: SoundType,
    @Req() req?: { user?: AuthJwtPayload },
  ) {
    if (!audio) {
      throw new BadRequestException('Audio file is required');
    }
    if (!type || (type !== 'background' && type !== 'ring')) {
      throw new BadRequestException('Type must be background or ring');
    }
    return this.sounds.upload(audio, type, req?.user?.sub, name);
  }

  @Post('complete-upload')
  completeUpload(
    @Body('key') key?: string,
    @Body('name') name?: string,
    @Body('type') type?: SoundType,
    @Req() req?: { user?: AuthJwtPayload },
  ) {
    if (!key?.trim()) {
      throw new BadRequestException('Uploaded key is required');
    }
    if (!type || (type !== 'background' && type !== 'ring')) {
      throw new BadRequestException('Type must be background or ring');
    }
    return this.sounds.completeUpload(key.trim(), type, req?.user?.sub, name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSoundDto) {
    return this.sounds.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sounds.remove(id);
  }
}
