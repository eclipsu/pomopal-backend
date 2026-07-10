import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SoundType = 'background' | 'ring';

@Entity('sound_library')
export class SoundLibrary {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: SoundType;

  @Column({ type: 'varchar', length: 512 })
  s3_key!: string;

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
