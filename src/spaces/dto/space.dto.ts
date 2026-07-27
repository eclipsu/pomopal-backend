import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  SpaceBackgroundFit,
  SpaceBackgroundType,
  SpaceTimerAnchor,
  SpaceVisibility,
} from '../../entities/space.entity';
import { parseCustomFontId } from '../../fonts/font.util';

const BACKGROUND_TYPES = ['solid', 'image', 'gif'] as const;
const BACKGROUND_FITS = ['fill', 'fit', 'stretch', 'tile'] as const;
const TIMER_ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
const VISIBILITIES = ['private', 'friends', 'public'] as const;

const ALLOWED_FONTS = new Set([
  'inherit',
  'Georgia, serif',
  '"Courier New", monospace',
  'Arial, sans-serif',
  '"Trebuchet MS", sans-serif',
  'Verdana, sans-serif',
]);

export class SpaceLayoutDto {
  @IsIn(BACKGROUND_TYPES)
  backgroundType!: SpaceBackgroundType;

  @IsString()
  @MaxLength(16)
  backgroundColor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  backgroundImageUrl?: string | null;

  @IsOptional()
  @IsIn(BACKGROUND_FITS)
  backgroundFit?: SpaceBackgroundFit;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  backgroundGifUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  backgroundGifPreviewUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  backgroundGifId?: string | null;

  @IsString()
  @MaxLength(80)
  timerFont!: string;

  @IsInt()
  @Min(32)
  @Max(160)
  timerFontSize!: number;

  @IsString()
  @MaxLength(16)
  timerColor!: string;

  @IsIn(TIMER_ANCHORS)
  timerAnchor!: SpaceTimerAnchor;

  @IsNumber()
  @Min(-800)
  @Max(800)
  timerOffsetX!: number;

  @IsNumber()
  @Min(-600)
  @Max(600)
  timerOffsetY!: number;

  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  timerScale!: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  ringSoundId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  focusSoundId?: string | null;
}

export class CreateSpaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: SpaceVisibility;

  @ValidateNested()
  @Type(() => SpaceLayoutDto)
  layout!: SpaceLayoutDto;
}

export class UpdateSpaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SpaceLayoutDto)
  layout?: SpaceLayoutDto;
}

export class PublishSpaceDto {
  @IsIn(VISIBILITIES)
  visibility!: SpaceVisibility;
}

/** Normalize legacy visibility values stored before the privacy redesign. */
export function normalizeVisibility(raw: string | null | undefined): SpaceVisibility {
  if (raw === 'friends' || raw === 'unlisted') return 'friends';
  if (raw === 'private' || raw === 'draft') return 'private';
  return 'public';
}

export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return base || 'space';
}

export function sanitizeLayout(input: SpaceLayoutDto) {
  const hexOk = (c: string) =>
    /^#[0-9A-Fa-f]{6}$/.test(c) || /^#[0-9A-Fa-f]{3}$/.test(c);

  const bucket = (process.env.BUCKET_NAME || 'pomopal').trim();
  const region = (process.env.BUCKET_REGION || 'us-east-2').trim();
  const s3Hosts = [
    `${bucket}.s3.${region}.amazonaws.com`,
    `${bucket}.s3.amazonaws.com`,
    `s3.${region}.amazonaws.com`,
    's3.amazonaws.com',
  ];

  const safeUrl = (url: string | null | undefined, hosts: string[]) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return null;
      if (
        !hosts.some(
          (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
        )
      ) {
        return null;
      }
      return parsed.toString().slice(0, 1024);
    } catch {
      return null;
    }
  };

  const customFontId = parseCustomFontId(input.timerFont);
  const font = ALLOWED_FONTS.has(input.timerFont)
    ? input.timerFont
    : customFontId
      ? `font:${customFontId}`
      : 'inherit';
  const fit = BACKGROUND_FITS.includes(
    input.backgroundFit as (typeof BACKGROUND_FITS)[number],
  )
    ? (input.backgroundFit as SpaceBackgroundFit)
    : 'fill';

  return {
    backgroundType: input.backgroundType,
    backgroundColor: hexOk(input.backgroundColor)
      ? input.backgroundColor
      : '#111827',
    backgroundImageUrl: safeUrl(input.backgroundImageUrl, s3Hosts),
    backgroundFit: fit,
    backgroundGifUrl: safeUrl(input.backgroundGifUrl, ['giphy.com']),
    backgroundGifPreviewUrl: safeUrl(input.backgroundGifPreviewUrl, [
      'giphy.com',
    ]),
    backgroundGifId: input.backgroundGifId
      ? String(input.backgroundGifId).slice(0, 64)
      : null,
    timerFont: font,
    timerFontSize: Math.min(160, Math.max(32, Math.round(input.timerFontSize))),
    timerColor: hexOk(input.timerColor) ? input.timerColor : '#ffffff',
    timerAnchor: input.timerAnchor,
    timerOffsetX: Math.min(800, Math.max(-800, Math.round(input.timerOffsetX))),
    timerOffsetY: Math.min(600, Math.max(-600, Math.round(input.timerOffsetY))),
    timerScale: Math.min(
      1.5,
      Math.max(0.5, Math.round(input.timerScale * 100) / 100),
    ),
    ringSoundId: input.ringSoundId ?? null,
    focusSoundId: input.focusSoundId ?? null,
  };
}
