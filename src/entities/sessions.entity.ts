import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum SessionType {
  POMODORO = 'pomodoro',
  SHORT_BREAK = 'short_break',
  LONG_BREAK = 'long_break',
}

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: SessionType })
  type: SessionType;

  @Column()
  planned_seconds: number;

  @Column()
  actual_seconds: number;

  @Column()
  started_at: Date;

  @Column({ nullable: true })
  ended_at: Date;

  @Column()
  completed: boolean;

  @CreateDateColumn()
  created_at: Date;
}
