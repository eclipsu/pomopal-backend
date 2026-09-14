import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export type NotificationType =
  | 'announcement'
  | 'streak_at_risk'
  | 'streak_milestone'
  | 'daily_nudge'
  | 'comeback'
  | 'focus_complete';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 32, default: 'announcement' })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'timestamptz', nullable: true })
  read_at!: Date | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  dedupe_key!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
