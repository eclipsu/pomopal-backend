import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { Session } from 'src/entities/sessions.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyStatsModule } from 'src/daily-stats/daily-stats.module';
import { User } from 'src/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session]),
    TypeOrmModule.forFeature([User]),
    DailyStatsModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
