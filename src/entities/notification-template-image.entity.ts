import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Registry of images uploaded via the admin image library (S3 object keys). */
@Entity('notification_template_images')
export class NotificationTemplateImage {
  @PrimaryColumn({ type: 'varchar', length: 512 })
  key!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  display_name!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by_email!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
