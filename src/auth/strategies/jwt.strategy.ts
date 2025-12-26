import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('jwt.secret');

    console.log('JWT STRATEGY CONSTRUCTOR');

    if (!secret) {
      throw new Error('JWT secret is not defined');
    }

    // super({
    //   jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    //   secretOrKey: secret,
    // });
    super({
      jwtFromRequest: (req) => {
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        console.log('EXTRACTED TOKEN:', token);
        console.log('DECODED:', jwt.decode(String(token)));
        return token;
      },
      secretOrKey: secret,
    });
  }

  validate(payload: any): any {
    return payload;
  }
}
