import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Space, SpaceView } from '../entities/space.entity';
import { SpaceStar } from '../entities/space-star.entity';
import { SoundLibrary } from '../entities/sound-library.entity';
import { User } from '../entities/user.entity';
import { PresenceModule } from '../presence/presence.module';
import { FriendsModule } from '../friendship/friendship.module';
import { UserModule } from '../user/user.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { DailyStatsModule } from '../daily-stats/daily-stats.module';
import { StreaksModule } from '../streaks/streaks.module';
import { FontsModule } from '../fonts/fonts.module';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { GiphyService } from './giphy.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt/optional-jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Space, SpaceView, SpaceStar, SoundLibrary, User]),
    PresenceModule,
    FriendsModule,
    UserModule,
    PrivacyModule,
    AuthModule,
    StorageModule,
    DailyStatsModule,
    StreaksModule,
    FontsModule,
  ],
  controllers: [SpacesController],
  providers: [SpacesService, GiphyService, OptionalJwtAuthGuard],
  exports: [SpacesService],
})
export class SpacesModule {}
