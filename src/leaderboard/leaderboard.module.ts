import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyStat } from 'src/entities/daily-stat.entity';
import { Friendship } from 'src/entities/friendship.entity';
import { User } from 'src/entities/user.entity';
import { UserPrivacy } from 'src/entities/user-privacy.entity';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { PresenceModule } from '../presence/presence.module';
import { AuthModule } from '../auth/auth.module';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt/optional-jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyStat, Friendship, User, UserPrivacy]),
    PresenceModule,
    AuthModule,
  ],
  providers: [LeaderboardService, OptionalJwtAuthGuard],
  controllers: [LeaderboardController],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
