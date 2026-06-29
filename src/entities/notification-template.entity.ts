import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { NotificationType } from './notification.entity';

@Entity('notification_templates')
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 512, nullable: true })
  image_url!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  // e.g. { minStreak: 3 } — interpreted by an EligibilityService
  @Column({ type: 'jsonb', default: {} })
  eligibility_rules!: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}