import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
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

  /**
   * Progressive audio proxy for library sounds (YouTube or S3).
   * Forwards Range so `<audio>` can start immediately on long tracks.
   */
  @Get('library/:id/stream')
  @Header('Accept-Ranges', 'bytes')
  @Header('Cache-Control', 'no-store')
  async streamLibrarySound(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.sounds.getPublicStreamTarget(id);

    if (target.kind === 's3') {
      await this.streamS3Sound(id, req, res);
      return;
    }

    const abort = new AbortController();
    const onClose = () => abort.abort();
    req.on('close', onClose);

    try {
      let upstream = await this.fetchUpstream(
        target.videoId,
        req,
        abort.signal,
        false,
      );

      // Expired / IP-mismatched URL — re-resolve once, bypassing the cache.
      if (upstream.status === 403 || upstream.status === 401) {
        upstream = await this.fetchUpstream(
          target.videoId,
          req,
          abort.signal,
          true,
        );
      }

      if (!upstream.ok && upstream.status !== 206) {
        res.status(502).json({ message: 'Upstream audio unavailable' });
        return;
      }

      res.status(upstream.status);
      this.copyStreamHeaders(upstream, res);

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0],
      );
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (isClientDisconnectError(err) || abort.signal.aborted) return;
      if (!res.headersSent) {
        res.status(502).json({ message: 'Could not stream audio' });
      } else if (!res.writableEnded) {
        res.end();
      }
    } finally {
      req.off('close', onClose);
    }
  }

  private async streamS3Sound(
    id: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const range =
      typeof req.headers['range'] === 'string' ? req.headers['range'] : undefined;

    try {
      const stream = await this.sounds.streamPublicS3Sound(id, range);
      res.status(stream.statusCode);
      res.setHeader('Content-Type', stream.contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      if (stream.contentLength != null) {
        res.setHeader('Content-Length', String(stream.contentLength));
      }
      if (stream.contentRange) {
        res.setHeader('Content-Range', stream.contentRange);
      }

      stream.body.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      stream.body.pipe(res);
    } catch (err) {
      if (isClientDisconnectError(err)) return;
      if (!res.headersSent) {
        const status =
          err instanceof BadRequestException
            ? 400
            : err instanceof NotFoundException
              ? 404
              : 502;
        res.status(status).json({
          message:
            err instanceof Error ? err.message : 'Could not stream audio',
        });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  }

  private async fetchUpstream(
    videoId: string,
    req: Request,
    signal: AbortSignal,
    forceRefresh: boolean,
  ): Promise<globalThis.Response> {
    const { url } = await this.youtubeParser.getStreamUrl(videoId, {
      forceRefresh,
    });
    const headers: Record<string, string> = {};
    const range = req.headers['range'];
    if (typeof range === 'string') headers['Range'] = range;
    return fetch(url, { headers, signal });
  }

  private copyStreamHeaders(upstream: globalThis.Response, res: Response): void {
    const passthrough = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
    ];
    for (const name of passthrough) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!upstream.headers.get('accept-ranges')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
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
