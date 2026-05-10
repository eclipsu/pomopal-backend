import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';
import { PresenceGateway } from './presence.gateway';
import { IdleSweepTask } from './idle-sweep.task';
import { RedisProvider } from './redis.provider';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [RedisProvider, PresenceService, PresenceGateway, IdleSweepTask],
  controllers: [PresenceController],
  exports: [PresenceService, RedisProvider],
})
export class PresenceModule {}
