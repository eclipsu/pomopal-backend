import { Module } from '@nestjs/common';
import { DailyStatsService } from './daily-stats.service';
import { DailyStatsController } from './daily-stats.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyStat } from 'src/entities/daily-stat.entity';
import { StreaksModule } from 'src/streaks/streaks.module';

@Module({
  imports: [TypeOrmModule.forFeature([DailyStat]), StreaksModule],
  controllers: [DailyStatsController],
  providers: [DailyStatsService],
  exports: [DailyStatsService],
})
export class DailyStatsModule {}
