import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

@Entity('friendships')
@Index('IDX_friendship_pair', ['requester', 'addressee'], { unique: true })
export class Friendship {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'addressee_id' })
  addressee!: User | null;

  @Column({ type: 'varchar', default: 'pending' })
  status!: FriendshipStatus;

  @Column({ nullable: true, type: 'text' })
  invite_token!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  invite_token_expires_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  accepted_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;
}
