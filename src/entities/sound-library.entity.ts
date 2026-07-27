import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SoundType = 'background' | 'ring';
export type SoundSource = 's3' | 'youtube';

@Entity('sound_library')
export class SoundLibrary {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: SoundType;

  /** Where the audio comes from. YouTube entries never use S3. */
  @Column({ type: 'varchar', length: 20, default: 's3' })
  source!: SoundSource;

  /** S3 object key — null for YouTube-sourced sounds. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  s3_key!: string | null;

  /** Canonical 11-char YouTube video id when source=youtube. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  youtube_video_id!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by_email!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
