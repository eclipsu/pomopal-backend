import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Session } from './sessions.entity';
import { DailyStat } from './daily-stat.entity';
import { Streak } from './streak.entity';
import { Friendship } from './friendship.entity';
import { UserPrivacy } from './user-privacy.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password_hash!: string;

  @Column({ default: 25 })
  pomodoro_minutes!: number;

  @Column({ default: 5 })
  short_break_minutes!: number;

  @Column({ default: 15 })
  long_break_minutes!: number;

  @Column({ nullable: true })
  avatar_url?: string;

  @Column({ default: 'America/Chicago' })
  time_zone!: string;

  @OneToMany(() => Session, (s) => s.user)
  sessions!: Session[];

  @OneToMany(() => DailyStat, (d) => d.user)
  daily_stats!: DailyStat[];

  @OneToMany(() => Streak, (s) => s.user)
  streaks!: Streak[];

  @OneToMany(() => Friendship, (f) => f.requester)
  sent_requests!: Friendship[];

  @OneToMany(() => Friendship, (f) => f.addressee)
  received_requests!: Friendship[];

  @OneToOne(() => UserPrivacy, (p) => p.user_id)
  privacy!: UserPrivacy;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
