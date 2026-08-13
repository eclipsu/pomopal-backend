import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostView } from '../entities/post-view.entity';
import { PostViewController } from './post-view.controller';
import { PostViewService } from './post-view.service';

@Module({
  imports: [TypeOrmModule.forFeature([PostView])],
  controllers: [PostViewController],
  providers: [PostViewService],
  exports: [PostViewService],
})
export class PostsModule {}
