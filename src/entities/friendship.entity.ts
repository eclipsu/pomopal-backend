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
@Index(['requester_id', 'addressee_id'], { unique: true })
export class Friendship {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  requester_id!: string;

  @Column({ type: 'uuid', nullable: true })
  addressee_id!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addressee_id' })
  addressee!: User;

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
