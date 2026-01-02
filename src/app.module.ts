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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
