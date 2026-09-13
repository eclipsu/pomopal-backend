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
        const animated =
          images.original?.url ||
          images.downsized?.url ||
          images.fixed_height?.url ||
          null;
        // Prefer still frames so space backgrounds don't keep animating.
        const still =
          images.original_still?.url ||
          images.downsized_still?.url ||
          images.fixed_height_still?.url ||
          images.fixed_width_still?.url ||
          null;
        const preview =
          still ||
          images.fixed_height_small_still?.url ||
          images.fixed_width_small_still?.url ||
          images.fixed_height_small?.url ||
          images.preview_gif?.url ||
          animated;
        const tiny =
          still ||
          images.fixed_width_small_still?.url ||
          images.fixed_height_small_still?.url ||
          images.fixed_width_small?.url ||
          preview;
        if (!animated && !still) return null;
        return {
          id: String(item.id),
          title: String(item.title || item.slug || 'GIF'),
          // `url` is what we paint on the timer / space — keep it still.
          url: String(still || animated),
          previewUrl: String(preview || still || animated),
          tinyUrl: String(tiny || preview || still || animated),
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
