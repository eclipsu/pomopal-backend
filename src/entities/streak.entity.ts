import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('streaks')
export class Streak {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ default: 0 })
  current_streak: number;

  @Column({ default: 0 })
  longest_streak: number;

  @Column({ type: 'date', nullable: true })
  last_active_date?: string; // YYYY-MM-DD
}
