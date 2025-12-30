import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthJwtPayload } from '../types/auth-jwtPayload';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(
  Strategy,
  'refresh-jwt',
) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('jwt.secretRefresh');

    console.log('JWT STRATEGY CONSTRUCTOR');

    if (!secret) {
      throw new Error('JWT secret is not defined');
    }

    super({
      jwtFromRequest: (req) => {
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        return token;
      },
      secretOrKey: secret,
    });
  }

  validate(payload: AuthJwtPayload) {
    return { id: payload.sub };
  }
}
