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
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import type { AuthJwtPayload } from '../auth/types/auth-jwtPayload';
import type { SoundType } from '../entities/sound-library.entity';
import { UpdateSoundDto } from './dto/update-sound.dto';
import { SoundsService } from './sounds.service';

const audioUpload = FileInterceptor('audio', {
  storage: memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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
