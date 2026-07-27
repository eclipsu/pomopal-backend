import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GifResult {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  tinyUrl: string;
}

/**
 * Giphy free API proxy — key stays on the server.
 * Get a free key: https://developers.giphy.com/dashboard/
 */
@Injectable()
export class GiphyService {
  constructor(private readonly config: ConfigService) {}

  private apiKey() {
    return this.config.get<string>('GIPHY_API_KEY')?.trim() || '';
  }

  private mapResults(json: any): GifResult[] {
    const data = Array.isArray(json?.data) ? json.data : [];
    return data
      .map((item: any) => {
        const images = item?.images || {};
        const gif =
          images.original?.url ||
          images.downsized?.url ||
          images.fixed_height?.url ||
          null;
        const preview =
          images.fixed_height_small?.url ||
          images.preview_gif?.url ||
          images.fixed_width_small?.url ||
          images.downsized_small?.url ||
          gif;
        const tiny =
          images.fixed_width_small?.url ||
          images.fixed_height_small?.url ||
          preview;
        if (!gif) return null;
        return {
          id: String(item.id),
          title: String(item.title || item.slug || 'GIF'),
          url: String(gif),
          previewUrl: String(preview || gif),
          tinyUrl: String(tiny || preview || gif),
        } as GifResult;
      })
      .filter(Boolean);
  }

  async search(q: string, limit = 16, offset = 0) {
    const key = this.apiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'Giphy is not configured (set GIPHY_API_KEY)',
      );
    }
    const query = q?.trim();
    if (!query) throw new BadRequestException('q is required');

    const params = new URLSearchParams({
      api_key: key,
      q: query,
      limit: String(Math.min(50, Math.max(1, limit))),
      offset: String(Math.max(0, offset)),
      rating: 'pg',
      lang: 'en',
    });

    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?${params.toString()}`,
    );
    if (!res.ok) {
      throw new ServiceUnavailableException('Giphy search failed');
    }
    const json = await res.json();
    return {
      next: '',
      results: this.mapResults(json),
    };
  }

  async featured(limit = 16, offset = 0) {
    const key = this.apiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'Giphy is not configured (set GIPHY_API_KEY)',
      );
    }

    const params = new URLSearchParams({
      api_key: key,
      limit: String(Math.min(50, Math.max(1, limit))),
      offset: String(Math.max(0, offset)),
      rating: 'pg',
    });

    const res = await fetch(
      `https://api.giphy.com/v1/gifs/trending?${params.toString()}`,
    );
    if (!res.ok) {
      throw new ServiceUnavailableException('Giphy trending failed');
    }
    const json = await res.json();
    return {
      next: '',
      results: this.mapResults(json),
    };
  }
}
