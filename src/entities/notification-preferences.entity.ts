import { Column, OneToOne } from 'typeorm';
import { Entity } from 'typeorm';
import { PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { JoinColumn } from 'typeorm';

@Entity()
export class NotficationPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ default: true })
  streak_updates: boolean;

  @Column({ default: true })
  streak_nudges: boolean;

  @Column({ default: true })
  inactive_reminders: boolean;

  @Column({ default: true })
  weekly_summaries: boolean;
}
