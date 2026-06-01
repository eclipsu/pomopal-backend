import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notification_preferences')
export class NotificationPreferences {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { unique: true })
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
