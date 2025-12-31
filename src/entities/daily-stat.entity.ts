import { Entity, Column, ManyToOne, Index } from 'typeorm';
import { PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('daily_stats')
@Index(['user', 'date'], { unique: true })
export class DailyStat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (u) => u.daily_stats, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  @Column({ default: 0 })
  total_focus_minutes: number;

  @Column({ default: 0 })
  total_break_minutes: number;

  @Column({ default: 0 })
  session_count: number;
}
