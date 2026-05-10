import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionsModule } from './sessions/sessions.module';
import dbConfig from './config/dbConfig';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { DailyStatsModule } from './daily-stats/daily-stats.module';
import { StreaksModule } from './streaks/streaks.module';
import { FriendsModule } from './friendship/friendship.module';
import { PrivacyModule } from './privacy/privacy.module';
import { MailModule } from './mail/mail.module';
import { PresenceModule } from './presence/presence.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import jwtConfig from './auth/config/jwt.config';

@Module({
  imports: [
    SessionsModule,
    ConfigModule.forRoot({ isGlobal: true, load: [dbConfig, jwtConfig] }),
    TypeOrmModule.forRootAsync({
      useFactory: dbConfig,
    }),
    UserModule,
    AuthModule,
    DailyStatsModule,
    StreaksModule,
    FriendsModule,
    PrivacyModule,
    MailModule,
    PresenceModule,
    LeaderboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
