import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      query?: { timezone?: string };
    }>();
    const res = context.switchToHttp().getResponse<{
      cookie: (name: string, value: string, options: object) => void;
    }>();

    const timezone = req.query?.timezone?.trim();
    if (timezone) {
      res.cookie('oauth_timezone', timezone, {
        httpOnly: true,
        maxAge: 10 * 60 * 1000,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    }

    return { session: false };
  }
}
