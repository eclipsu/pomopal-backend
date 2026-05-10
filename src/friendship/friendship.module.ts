import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Friendship } from '../entities/friendship.entity';
import { UserPrivacy } from '../entities/user-privacy.entity';
import { User } from '../entities/user.entity';

import { FriendshipService } from './friendship.service';
import { FriendshipController } from './friendship.controller';

import { PresenceModule } from 'src/presence/presence.module';
import { PrivacyModule } from 'src/privacy/privacy.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Friendship, UserPrivacy, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    PresenceModule,
    PrivacyModule,
    MailModule,
  ],
  providers: [FriendshipService],
  controllers: [FriendshipController],
  exports: [FriendshipService],
})
export class FriendsModule {}
