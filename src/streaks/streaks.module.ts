import { Module } from '@nestjs/common';
import { StreaksService } from './streaks.service';
import { StreaksController } from './streaks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Streak } from '../entities/streak.entity';
import { User } from 'src/entities/user.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Streak]),
    TypeOrmModule.forFeature([User]),
    MailModule,
  ],
  controllers: [StreaksController],
  providers: [StreaksService],
  exports: [StreaksService],
})
export class StreaksModule {}