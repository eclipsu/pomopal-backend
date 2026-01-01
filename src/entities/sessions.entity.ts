import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum SessionType {
  POMODORO = 'pomodoro',
  SHORT_BREAK = 'short_break',
  LONG_BREAK = 'long_break',
}

@Entity('sessions')
@Index(['user', 'started_at'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (u) => u.sessions, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'enum', enum: SessionType })
  type: SessionType;

  @Column()
  planned_duration_minutes: number;

  @Column({ nullable: true })
  actual_duration_minutes?: number;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at?: Date;

  @Column({ default: false })
  completed: boolean;

  @CreateDateColumn()
  created_at: Date;
}
