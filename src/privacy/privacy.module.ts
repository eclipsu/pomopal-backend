import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPrivacy } from 'src/entities/user-privacy.entity';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPrivacy]),
    forwardRef(() => LeaderboardModule),
  ],
  providers: [PrivacyService],
  controllers: [PrivacyController],
  exports: [PrivacyService],
})
export class PrivacyModule {}
