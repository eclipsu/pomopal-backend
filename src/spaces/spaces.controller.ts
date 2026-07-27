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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt/optional-jwt-auth.guard';
import {
  CreateSpaceDto,
  PublishSpaceDto,
  UpdateSpaceDto,
} from './dto/space.dto';
import { SpacesService } from './spaces.service';
import { GiphyService } from './giphy.service';

interface AuthRequest extends Request {
  user: { sub: string };
}

interface OptionalAuthRequest extends Request {
  user?: { sub: string };
}

const imageUpload = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller()
export class SpacesController {
  constructor(
    private readonly spaces: SpacesService,
    private readonly giphy: GiphyService,
  ) {}

  // ── Giphy (public proxy; API key stays on server) ──────────────

  @Get('giphy/search')
  searchGiphy(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.giphy.search(
      q,
      limit ? Number(limit) : 16,
      offset ? Number(offset) : 0,
    );
  }

  @Get('giphy/featured')
  featuredGiphy(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.giphy.featured(
      limit ? Number(limit) : 16,
      offset ? Number(offset) : 0,
    );
  }

  // ── Profiles ───────────────────────────────────────────────────

  @Get('profiles/sitemap')
  profilesSitemap() {
    return this.spaces.listPublicProfiles();
  }

  @Get('profiles/:username')
  @UseGuards(OptionalJwtAuthGuard)
  getProfile(
    @Param('username') username: string,
    @Req() req: OptionalAuthRequest,
  ) {
    return this.spaces.getProfile(username, req.user?.sub);
  }

  @Get('profiles/:username/spaces/:spaceSlug')
  @UseGuards(OptionalJwtAuthGuard)
  getProfileSpace(
    @Param('username') username: string,
    @Param('spaceSlug') spaceSlug: string,
    @Req() req: OptionalAuthRequest,
  ) {
    return this.spaces.findByUsernameAndSlug(
      username,
      spaceSlug,
      req.user?.sub,
    );
  }

  // ── Public browse / SEO ────────────────────────────────────────

  @Get('spaces')
  browse(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.spaces.browse(
      q,
      limit ? Number(limit) : 24,
      offset ? Number(offset) : 0,
    );
  }

  @Get('spaces/sitemap')
  sitemap() {
    return this.spaces.listPublicSlugs();
  }

  @Get('spaces/by-slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  getBySlug(
    @Param('slug') slug: string,
    @Req() req: OptionalAuthRequest,
  ) {
    return this.spaces.findBySlug(slug, req.user?.sub);
  }

  @Post('spaces/by-slug/:slug/view')
  @UseGuards(OptionalJwtAuthGuard)
  recordView(
    @Param('slug') slug: string,
    @Req() req: OptionalAuthRequest,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const ua = req.headers['user-agent'] || '';
    return this.spaces.recordView(slug, `${ip}|${ua}`, req.user?.sub);
  }

  @Post('spaces/by-slug/:slug/star')
  @UseGuards(JwtAuthGuard)
  star(@Req() req: AuthRequest, @Param('slug') slug: string) {
    return this.spaces.star(req.user.sub, slug);
  }

  @Delete('spaces/by-slug/:slug/star')
  @UseGuards(JwtAuthGuard)
  unstar(@Req() req: AuthRequest, @Param('slug') slug: string) {
    return this.spaces.unstar(req.user.sub, slug);
  }

  // ── Owner routes (auth required) ───────────────────────────────

  @Post('spaces/upload-background')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(imageUpload)
  uploadBackground(@UploadedFile() image?: Express.Multer.File) {
    if (!image) {
      throw new BadRequestException('Image file is required');
    }
    return this.spaces.uploadBackground(image);
  }

  @Get('spaces/mine')
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: AuthRequest) {
    return this.spaces.listMine(req.user.sub);
  }

  @Post('spaces')
  @UseGuards(JwtAuthGuard)
  create(@Req() req: AuthRequest, @Body() dto: CreateSpaceDto) {
    return this.spaces.create(req.user.sub, dto);
  }

  @Patch('spaces/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSpaceDto,
  ) {
    return this.spaces.update(req.user.sub, id, dto);
  }

  @Post('spaces/:id/publish')
  @UseGuards(JwtAuthGuard)
  publish(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: PublishSpaceDto,
  ) {
    return this.spaces.publish(req.user.sub, id, dto);
  }

  @Post('spaces/:id/unpublish')
  @UseGuards(JwtAuthGuard)
  unpublish(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.spaces.unpublish(req.user.sub, id);
  }

  @Delete('spaces/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.spaces.remove(req.user.sub, id);
  }

  @Post('spaces/by-slug/:slug/remix')
  @UseGuards(JwtAuthGuard)
  remix(@Req() req: AuthRequest, @Param('slug') slug: string) {
    return this.spaces.remix(req.user.sub, slug);
  }
}
