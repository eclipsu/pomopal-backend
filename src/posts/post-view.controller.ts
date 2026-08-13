import { Controller, Post, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PostViewService } from './post-view.service';

@Controller('posts')
export class PostViewController {
  constructor(private postViewService: PostViewService) {}

  @Post(':slug/view')
  async recordView(
    @Param('slug') slug: string,
    @Req() req: Request,
  ): Promise<{ counted: boolean }> {
    const ip = this.getIp(req);
    return this.postViewService.recordView(slug, ip);
  }

  @Get(':slug/views')
  async getViews(@Param('slug') slug: string) {
    const count = await this.postViewService.getCount(slug);
    return { slug, count };
  }

  @Get('views')
  async getBulkViews(@Query('slugs') slugs: string) {
    const slugArray = slugs.split(',');
    return this.postViewService.getCounts(slugArray);
  }

  private getIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip ?? 'unknown';
  }
}
