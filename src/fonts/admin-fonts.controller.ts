import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { getMaxFontBytes } from '../storage/storage.service';
import { UpdateFontDto } from './dto/update-font.dto';
import { FontsService } from './fonts.service';

const fontUpload = FileInterceptor('font', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpdir()),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname || '') || '.ttf';
      cb(null, `pomopal-font-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: getMaxFontBytes() },
});

@Controller('admin/fonts')
@UseGuards(AdminGuard)
export class AdminFontsController {
  constructor(private readonly fonts: FontsService) {}

  @Get()
  list() {
    return this.fonts.findAllAdmin();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.fonts.findOneAdmin(id);
  }

  @Post('upload-url')
  uploadUrl(@Body('mimetype') mimetype?: string) {
    if (!mimetype?.trim()) {
      throw new BadRequestException('Font MIME type is required');
    }
    return this.fonts.createUploadTarget(mimetype);
  }

  @Post('upload')
  @UseInterceptors(fontUpload)
  upload(
    @UploadedFile() font?: Express.Multer.File,
    @Body('name') name?: string,
    @Req() req?: { user?: AuthJwtPayload },
  ) {
    if (!font) {
      throw new BadRequestException('Font file is required');
    }
    return this.fonts.upload(font, req?.user?.sub, name);
  }

  @Post('complete-upload')
  completeUpload(
    @Body('key') key?: string,
    @Body('name') name?: string,
    @Req() req?: { user?: AuthJwtPayload },
  ) {
    if (!key?.trim()) {
      throw new BadRequestException('Uploaded key is required');
    }
    return this.fonts.completeUpload(key.trim(), req?.user?.sub, name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFontDto) {
    return this.fonts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fonts.remove(id);
  }
}
