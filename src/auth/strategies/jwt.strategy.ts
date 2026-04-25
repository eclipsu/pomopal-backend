/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('jwt.secret');

    if (!secret) {
      throw new Error('JWT secret is not defined');
    }

    super({
      jwtFromRequest: (req: Request) => {
        const fromCookie = req?.cookies?.['access_token'];
        const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        return fromCookie ?? fromHeader;
      },
      secretOrKey: secret,
    });
  }

  validate(payload: any): any {
    return payload;
  }
}
