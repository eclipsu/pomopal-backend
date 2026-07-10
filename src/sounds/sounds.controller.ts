import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isClientDisconnectError } from '../common/is-client-disconnect-error';
import { ParseYoutubeDto } from './dto/parse-youtube.dto';
import { SoundsService } from './sounds.service';
import { YoutubeParserService } from './youtube-parser.service';
import type { SoundType } from '../entities/sound-library.entity';

const STREAM_HEARTBEAT_MS = 10_000;

function writeStreamLine(res: Response, payload: Record<string, unknown>) {
  if (res.writableEnded) return;
  res.write(`${JSON.stringify(payload)}\n`);
  const flushable = res as Response & { flush?: () => void };
  flushable.flush?.();
}

@Controller('sounds')
export class SoundsController {
  constructor(
    private readonly sounds: SoundsService,
    private readonly youtubeParser: YoutubeParserService,
  ) {}

  @Get('library')
  library(@Query('type') type?: SoundType) {
    if (type && type !== 'background' && type !== 'ring') {
      return this.sounds.findPublicLibrary();
    }
    return this.sounds.findPublicLibrary(type);
  }

  @Get('library/:id/file')
  async libraryFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.sounds.findPublicSoundFile(id);
    res.set({
      'Cache-Control': 'private, max-age=31536000',
      'X-Sound-Version': String(file.version),
    });
    return new StreamableFile(file.buffer, { type: file.contentType });
  }

  @Post('parse-youtube')
  async parseYoutube(
    @Body() dto: ParseYoutubeDto,
    @Query('stream') stream: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    if (stream === '1') {
      res.status(200);
      res.setHeader('Content-Type', 'application/x-pomopal-youtube-audio');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Accel-Buffering', 'no');

      const abort = new AbortController();
      const onRequestAborted = () => abort.abort();
      req.on('aborted', onRequestAborted);

      let latestProgress: Record<string, unknown> = { phase: 'meta', percent: 0 };
      writeStreamLine(res, latestProgress);

      const heartbeat = setInterval(() => {
        if (req.aborted || res.writableEnded) return;
        writeStreamLine(res, { ...latestProgress, heartbeat: true });
      }, STREAM_HEARTBEAT_MS);

      try {
        const parsed = await this.youtubeParser.parseWithProgress(
          dto.url,
          (percent, phase) => {
            latestProgress = { phase, percent: Math.round(percent) };
            writeStreamLine(res, latestProgress);
          },
          { signal: abort.signal },
        );

        writeStreamLine(res, {
          phase: 'done',
          videoId: parsed.videoId,
          title: parsed.title,
          durationSeconds: parsed.durationSeconds,
          byteLength: parsed.buffer.length,
          mimeType: parsed.mimeType,
        });

        if (!res.writableEnded) {
          res.write(parsed.buffer);
          res.end();
        }
      } catch (err) {
        if (isClientDisconnectError(err)) {
          return;
        }
        const message =
          err instanceof BadRequestException
            ? err.message
            : 'Could not extract audio from this video';
        writeStreamLine(res, { phase: 'error', message });
        if (!res.writableEnded) {
          res.end();
        }
      } finally {
        clearInterval(heartbeat);
        req.off('aborted', onRequestAborted);
      }
      return;
    }

    const parsed = await this.youtubeParser.parse(dto.url);

    const ext =
      parsed.mimeType === 'audio/mp4'
        ? 'm4a'
        : parsed.mimeType === 'audio/webm'
          ? 'webm'
          : 'mp3';

    res.set({
      'X-Video-Id': parsed.videoId,
      'X-Sound-Title': encodeURIComponent(parsed.title),
      'X-Duration-Seconds': String(parsed.durationSeconds),
      'Cache-Control': 'private, max-age=31536000',
    });

    return new StreamableFile(parsed.buffer, {
      type: parsed.mimeType,
      disposition: `inline; filename="${parsed.videoId}.${ext}"`,
    });
  }
}
