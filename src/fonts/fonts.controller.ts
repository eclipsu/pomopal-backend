import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { FontsService } from './fonts.service';

@Controller('fonts')
export class FontsController {
  constructor(private readonly fonts: FontsService) {}

  /** Active fonts for the space editor dropdown. */
  @Get('library')
  library() {
    return this.fonts.findPublicLibrary();
  }

  /**
   * Same-origin TTF proxy (via /api rewrite) so @font-face works without S3 CORS.
   */
  @Get('library/:id/file')
  async libraryFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.fonts.findPublicFontFile(id);
    res.set({
      'Content-Type': file.contentType || 'font/ttf',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Font-Version': String(file.version),
    });
    return new StreamableFile(file.buffer, {
      type: file.contentType || 'font/ttf',
    });
  }

  /** Immutable baked copy for a space — survives library font deletion. */
  @Get('baked/:spaceId/file')
  async bakedFile(
    @Param('spaceId') spaceId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.fonts.findBakedFontFile(spaceId);
    res.set({
      'Content-Type': file.contentType || 'font/ttf',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    });
    return new StreamableFile(file.buffer, {
      type: file.contentType || 'font/ttf',
    });
  }
}
