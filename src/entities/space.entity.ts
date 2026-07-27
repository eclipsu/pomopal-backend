import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/** Who can open this space (default public). */
export type SpaceVisibility = 'private' | 'friends' | 'public';

export type SpaceBackgroundType = 'solid' | 'image' | 'gif';

/** How image/GIF backgrounds are painted on the viewport. */
export type SpaceBackgroundFit = 'fill' | 'fit' | 'stretch' | 'tile';

export type SpaceTimerAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** Typed layout only — never store arbitrary CSS from clients. */
export interface SpaceLayout {
  backgroundType: SpaceBackgroundType;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  backgroundFit: SpaceBackgroundFit;
  backgroundGifUrl: string | null;
  backgroundGifPreviewUrl: string | null;
  backgroundGifId: string | null;
  timerFont: string;
  timerFontSize: number;
  timerColor: string;
  timerAnchor: SpaceTimerAnchor;
  timerOffsetX: number;
  timerOffsetY: number;
  timerScale: number;
  ringSoundId: string | null;
  focusSoundId: string | null;
}

/**
 * Immutable snapshot built on creator save.
 * Clients apply this directly — no extra /fonts or /sounds library round-trips.
 * Remade only when the owner updates the space.
 */
export interface SpaceBaked {
  v: 1;
  baked_at: string;
  layout: SpaceLayout;
  font: {
    token: string;
    /** CSS family for custom fonts; null for builtins / inherit */
    family: string | null;
    /** Public TTF URL (baked copy under spaces/baked/…) or null */
    url: string | null;
  };
  ring: {
    id: string;
    streamPath: string;
    name: string;
  } | null;
  focus: {
    id: string;
    streamPath: string;
    name: string;
  } | null;
}

@Entity('spaces')
@Index(['visibility', 'published_at'])
@Index(['owner', 'updated_at'])
export class Space {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ name: 'owner_id' })
  owner_id!: string;

  @Column({ length: 80 })
  title!: string;

  /** Public path segment: `{title-slug}-{uuid}` — unique, stable. */
  @Column({ type: 'varchar', length: 160, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  @Column({ type: 'varchar', length: 16, default: 'public' })
  visibility!: SpaceVisibility;

  @Column({ type: 'varchar', length: 512, nullable: true })
  cover_image_url!: string | null;

  @Column({ type: 'jsonb' })
  layout!: SpaceLayout;

  /**
   * Server-made snapshot of layout + resolved font/sound assets.
   * Kept forever until the creator saves again (then remade).
   */
  @Column({ type: 'jsonb', nullable: true })
  baked!: SpaceBaked | null;

  @Column({ type: 'timestamptz', nullable: true })
  baked_at!: Date | null;

  @Column({ type: 'int', default: 1 })
  layout_version!: number;

  @Column({ type: 'int', default: 0 })
  view_count!: number;

  @Column({ type: 'int', default: 0 })
  star_count!: number;

  @Column({ type: 'int', default: 0 })
  fork_count!: number;

  /** Space this was remixed from (null if original). */
  @Column({ type: 'uuid', nullable: true })
  parent_space_id!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  published_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('space_views')
@Index(['space_id', 'viewer_hash', 'viewed_on'], { unique: true })
export class SpaceView {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  space_id!: string;

  /** Hash of IP + UA (or user id) — one count per visitor per day */
  @Column({ type: 'varchar', length: 64 })
  viewer_hash!: string;

  @Column({ type: 'date' })
  viewed_on!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
