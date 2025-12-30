/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import googleOauthConfig from '../config/google-oauth.config';
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { AuthService } from '../auth.service';
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @Inject(googleOauthConfig.KEY)
    private googleConfiguration: ConfigType<typeof googleOauthConfig>,
    private authService: AuthService,
  ) {
    super({
      clientID: googleConfiguration.clientId!,
      clientSecret: googleConfiguration.clientSecret!,
      callbackURL: googleConfiguration.redirectUri!,
      scope: ['email', 'profile'],
    });
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    console.log(profile);
    const user = await this.authService.validateGoogleUser({
      email: profile.emails[0].value,
      name: profile.displayName,
      avatar_url: profile.photos[0].value,
      password: '',
      timezone: '',
      pomodoro_minutes: 25,
      short_break_minutes: 5,
      long_break_minutes: 15,
    });
    done(null, user);
  }
}
