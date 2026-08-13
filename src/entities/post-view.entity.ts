import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['slug', 'ipHash'], { unique: true })
export class PostView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  slug: string;

  @Column()
  ipHash: string;

  @CreateDateColumn()
  viewedAt: Date;
}
