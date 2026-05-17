import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_privacy')
export class UserPrivacy {
  @PrimaryColumn('uuid')
  user_id!: string;

  @Column({ default: true })
  show_online_status!: boolean;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ default: true })
  show_current_activity!: boolean;

  @Column({ default: true })
  show_daily_stats!: boolean;

  @Column({ default: true })
  show_streak!: boolean;

  @Column({ default: true })
  show_total_focus_time!: boolean;

  @Column({ default: true })
  show_on_leaderboard!: boolean;
}
