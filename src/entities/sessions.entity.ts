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

export interface SessionSoundSnapshot {
  enabled?: boolean;
  volume?: number;
  kind: 'default' | 'library' | 'youtube' | 'none';
  id?: string | null;
  videoId?: string | null;
  name?: string | null;
  title?: string | null;
}

export interface SessionContextSnapshot {
  timer_mode_index: number;
  timer_mode_label: 'pomodoro' | 'short_break' | 'long_break';
  timer_planned_minutes: number;
  background_sound: SessionSoundSnapshot;
  ring_sound: SessionSoundSnapshot;
}

@Entity('sessions')
@Index(['user', 'started_at'])
@Index(['user', 'session_name_hash'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (u) => u.sessions, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'enum', enum: SessionType })
  type: SessionType;

  @Column({ type: 'varchar', length: 80, nullable: true, default: 'Untitled Session' })
  session_name?: string | null;

  /** sha256 of lowercase normalized name — groups similar labels for analytics */
  @Column({ type: 'varchar', length: 64, nullable: true })
  session_name_hash?: string | null;

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

  @Column({ type: 'jsonb', nullable: true })
  session_context?: SessionContextSnapshot | null;

  @CreateDateColumn()
  created_at: Date;
}
