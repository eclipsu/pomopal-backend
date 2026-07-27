import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Admin-curated TTF fonts for the space timer dropdown. */
@Entity('font_library')
export class FontLibrary {
  @PrimaryColumn('uuid')
  id!: string;

  /** Dropdown label */
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** CSS font-family name used in @font-face / timer styles */
  @Column({ type: 'varchar', length: 64 })
  family_name!: string;

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
