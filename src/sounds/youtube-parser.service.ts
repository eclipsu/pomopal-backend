import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import {
  buildYoutubeWatchUrl,
  extractYoutubeVideoId,
} from './youtube.util';

const execFileAsync = promisify(execFile);

/** Ambient tracks are often 2–3 hours. */
const DEFAULT_MAX_DURATION_SECONDS = 3 * 60 * 60;
const DEFAULT_MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const META_TIMEOUT_MS = 90_000;
const MIN_PARSE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PARSE_TIMEOUT_MS = 90 * 60 * 1000;

const YT_DLP_COMMON_ARGS = [
  '--no-playlist',
  '--no-update',
  '--retries',
  '5',
  '--fragment-retries',
  '5',
  '--extractor-args',
  'youtube:player_client=android_vr,web',
] as const;

const DEFAULT_CONCURRENT_FRAGMENTS = 8;

/** Prefer native audio containers — avoids slow ffmpeg MP3 transcoding. */
const FAST_AUDIO_FORMAT =
  'ba[ext=m4a]/ba[abr<=160]/ba/bestaudio/best';

const AUDIO_EXTENSIONS = ['.m4a', '.webm', '.opus', '.ogg', '.mp3'] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
};

export type YoutubeParsePhase = 'meta' | 'download' | 'encode';

interface YoutubeMeta {
  id: string;
  title: string;
  duration: number;
  is_live: boolean;
}

export interface ParsedYoutubeAudio {
  videoId: string;
  title: string;
  durationSeconds: number;
  buffer: Buffer;
  mimeType: string;
}

function resolveConcurrentFragments(): number {
  const fromEnv = Number(process.env.YT_DLP_CONCURRENT_FRAGMENTS);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(Math.floor(fromEnv), 32);
  }
  return DEFAULT_CONCURRENT_FRAGMENTS;
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

function resolveYtDlpPath(): string {
  const fromEnv = process.env.YT_DLP_PATH?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return 'yt-dlp';
}

function computeParseTimeoutMs(durationSeconds: number): number {
  const fromEnv = Number(process.env.YOUTUBE_PARSE_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  // ~1s of wall time per 1s of video, plus 3 min base; cap at 90 min.
  const scaled = 3 * 60 * 1000 + durationSeconds * 1000;
  return Math.min(
    Math.max(scaled, MIN_PARSE_TIMEOUT_MS),
    MAX_PARSE_TIMEOUT_MS,
  );
}

interface DownloadedAudio {
  buffer: Buffer;
  mimeType: string;
}

export interface YoutubeParseOptions {
  signal?: AbortSignal;
}

@Injectable()
export class YoutubeParserService {
  private readonly logger = new Logger(YoutubeParserService.name);
  private readonly ytDlpPath = resolveYtDlpPath();
  private readonly concurrentFragments = resolveConcurrentFragments();
  private readonly maxDurationSeconds = Number(
    process.env.YOUTUBE_MAX_DURATION_SECONDS ||
      DEFAULT_MAX_DURATION_SECONDS,
  );
  private readonly maxAudioBytes = Number(
    process.env.YOUTUBE_MAX_AUDIO_BYTES || DEFAULT_MAX_AUDIO_BYTES,
  );

  async parse(urlOrId: string): Promise<ParsedYoutubeAudio> {
    return this.parseWithProgress(urlOrId);
  }

  async parseWithProgress(
    urlOrId: string,
    onProgress?: (percent: number, phase: YoutubeParsePhase) => void,
    options?: YoutubeParseOptions,
  ): Promise<ParsedYoutubeAudio> {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const videoId = extractYoutubeVideoId(urlOrId);
    if (!videoId) {
      throw new BadRequestException('Invalid YouTube URL');
    }

    this.logger.debug(`Using yt-dlp at ${this.ytDlpPath}`);

    const watchUrl = buildYoutubeWatchUrl(videoId);
    onProgress?.(0, 'meta');
    const meta = await this.fetchMeta(watchUrl, videoId);
    onProgress?.(8, 'meta');

    if (meta.is_live) {
      throw new BadRequestException('Live streams are not supported');
    }
    if (meta.duration > this.maxDurationSeconds) {
      throw new BadRequestException(
        `Video must be ${Math.floor(this.maxDurationSeconds / 60)} minutes or shorter`,
      );
    }

    const timeoutMs = computeParseTimeoutMs(meta.duration);
    this.logger.log(
      `Parsing ${videoId} (${Math.round(meta.duration / 60)} min), ` +
        `timeout ${Math.round(timeoutMs / 60000)} min, ` +
        `${this.concurrentFragments} concurrent fragments, native audio (no MP3 transcode)`,
    );

    const downloaded = await this.downloadAudioWithProgress(
      watchUrl,
      timeoutMs,
      (downloadPct) => {
        onProgress?.(8 + downloadPct * 0.92, 'download');
      },
      signal,
    );

    onProgress?.(100, 'encode');

    if (!downloaded.buffer.length) {
      throw new BadRequestException('Could not extract audio from this video');
    }
    if (downloaded.buffer.length > this.maxAudioBytes) {
      throw new BadRequestException(
        `Extracted audio is too large (max ${Math.floor(this.maxAudioBytes / (1024 * 1024))} MB). Try a shorter video.`,
      );
    }

    this.logger.log(
      `Parsed ${videoId}: ${downloaded.buffer.length} bytes (${downloaded.mimeType})`,
    );

    return {
      videoId,
      title: meta.title,
      durationSeconds: meta.duration,
      buffer: downloaded.buffer,
      mimeType: downloaded.mimeType,
    };
  }

  private async fetchMeta(
    watchUrl: string,
    expectedId: string,
  ): Promise<YoutubeMeta> {
    try {
      const { stdout } = await execFileAsync(
        this.ytDlpPath,
        [
          ...YT_DLP_COMMON_ARGS,
          '--dump-single-json',
          '--no-download',
          watchUrl,
        ],
        { timeout: META_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      );
      const data = JSON.parse(stdout) as {
        id?: string;
        title?: string;
        duration?: number;
        is_live?: boolean;
      };
      if (data.id !== expectedId) {
        throw new BadRequestException('Could not resolve YouTube video');
      }
      return {
        id: data.id,
        title: (data.title ?? '').slice(0, 200) || expectedId,
        duration: typeof data.duration === 'number' ? data.duration : 0,
        is_live: Boolean(data.is_live),
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (this.isMissingBinaryError(err)) {
        throw new ServiceUnavailableException(
          'YouTube audio extraction is not available on this server',
        );
      }
      this.logger.warn(
        `yt-dlp metadata failed: ${this.formatExecError(err)}`,
      );
      throw new BadRequestException(
        'Could not fetch video info — check the URL and try again',
      );
    }
  }

  private downloadAudioWithProgress(
    watchUrl: string,
    timeoutMs: number,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<DownloadedAudio> {
    const token = randomUUID();
    const outBase = path.join(os.tmpdir(), `pomopal-yt-${token}`);
    const outTemplate = `${outBase}.%(ext)s`;

    const args = [
      ...YT_DLP_COMMON_ARGS,
      '--concurrent-fragments',
      String(this.concurrentFragments),
      '-f',
      FAST_AUDIO_FORMAT,
      '--newline',
      '-o',
      outTemplate,
      watchUrl,
    ];

    this.logger.debug(`yt-dlp args: ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ytDlpPath, args);

      let stderr = '';
      let settled = false;
      const finish = (value: DownloadedAudio) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      };

      const onAbort = () => {
        this.logger.debug('YouTube download aborted by client disconnect');
        proc.kill('SIGKILL');
        fail(new Error('Request aborted'));
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        fail(
          new BadRequestException(
            'Audio extraction timed out — very long videos can take up to 90 minutes',
          ),
        );
      }, timeoutMs);

      const handleOutput = (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split('\n')) {
          const downloadMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
          if (downloadMatch) {
            onProgress(parseFloat(downloadMatch[1]));
          }
        }
      };

      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        handleOutput(chunk);
      });

      proc.on('error', (err) => {
        if (this.isMissingBinaryError(err)) {
          fail(
            new ServiceUnavailableException(
              'YouTube audio extraction is not available on this server',
            ),
          );
          return;
        }
        fail(err);
      });

      proc.on('close', async (code) => {
        try {
          if (settled) return;

          const result = await this.readOutputAudio(outBase);
          if (result.buffer.length > 0 && code === 0) {
            onProgress(100);
            finish(result);
            return;
          }

          if (result.buffer.length > 0 && code !== 0) {
            this.logger.warn(
              `yt-dlp exited ${code} but produced ${result.buffer.length} bytes for ${outBase}`,
            );
            onProgress(100);
            finish(result);
            return;
          }

          fail(
            new BadRequestException(this.userFacingExtractError(stderr, code)),
          );
          this.logger.warn(
            `yt-dlp download failed: ${this.formatSpawnError(code, stderr)}`,
          );
        } catch (err) {
          if (settled) return;
          if (err instanceof BadRequestException) {
            fail(err);
          } else {
            fail(
              new BadRequestException(
                this.userFacingExtractError(stderr, code),
              ),
            );
          }
        } finally {
          await this.cleanupTempFiles(outBase);
        }
      });
    });
  }

  private async readOutputAudio(outBase: string): Promise<DownloadedAudio> {
    for (const ext of AUDIO_EXTENSIONS) {
      const filePath = `${outBase}${ext}`;
      try {
        const stat = await fsPromises.stat(filePath);
        if (stat.size > 0) {
          const buffer = await fsPromises.readFile(filePath);
          return { buffer, mimeType: mimeFromPath(filePath) };
        }
      } catch {
        // try next extension
      }
    }

    const dir = path.dirname(outBase);
    const prefix = path.basename(outBase);
    const entries = await fsPromises.readdir(dir);
    const match = entries.find(
      (name) =>
        name.startsWith(prefix) &&
        AUDIO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)),
    );
    if (!match) {
      throw new BadRequestException('Could not extract audio from this video');
    }
    const filePath = path.join(dir, match);
    const buffer = await fsPromises.readFile(filePath);
    return { buffer, mimeType: mimeFromPath(filePath) };
  }

  private userFacingExtractError(stderr: string, code: number | null): string {
    const lines = stderr
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const errorLine = [...lines]
      .reverse()
      .find((l) => l.startsWith('ERROR:') || l.includes('error'));
    if (errorLine?.includes('too large')) {
      return 'Extracted audio is too large for this server';
    }
    if (errorLine?.includes('DRM')) {
      return 'This video is protected and cannot be used';
    }
    if (code === null || code === 137) {
      return 'Audio extraction timed out — try again or use a shorter video';
    }
    if (errorLine) {
      return 'Could not extract audio from this video';
    }
    return 'Could not extract audio from this video';
  }

  private formatExecError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const stderr =
      typeof err === 'object' &&
      err !== null &&
      'stderr' in err &&
      typeof (err as { stderr?: unknown }).stderr === 'string'
        ? (err as { stderr: string }).stderr.trim()
        : '';
    return stderr ? `${err.message}\n${stderr}` : err.message;
  }

  private formatSpawnError(code: number | null, stderr: string): string {
    const tail = stderr.trim().split('\n').slice(-5).join('\n');
    return `exit ${code ?? 'unknown'}${tail ? `\n${tail}` : ''}`;
  }

  private isMissingBinaryError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }

  private async cleanupTempFiles(outBase: string): Promise<void> {
    const dir = path.dirname(outBase);
    const prefix = path.basename(outBase);
    try {
      const entries = await fsPromises.readdir(dir);
      await Promise.all(
        entries
          .filter((name) => name.startsWith(prefix))
          .map((name) =>
            fsPromises.unlink(path.join(dir, name)).catch(() => undefined),
          ),
      );
    } catch {
      // ignore cleanup errors
    }
  }
}
