import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('notification_preferences')
export class NotificationPreferences {
  @PrimaryColumn('uuid')
  user_id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ default: true })
  streak_updates!: boolean;

  @Column({ default: true })
  streak_nudges!: boolean;

  @Column({ default: true })
  inactive_reminders!: boolean;

  @Column({ default: true })
  product_announcements!: boolean;
}
