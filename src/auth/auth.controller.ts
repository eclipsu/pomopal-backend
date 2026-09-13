/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  HttpStatus,
  HttpCode,
  Post,
  Request,
  UseGuards,
  Req,
  Res,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { RefreshAuthGuard } from './guards/refresh-auth/refresh-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

const SESSION_HINT = 'pomopal_session';
const isProd = process.env.NODE_ENV === 'production';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setSessionHint(res: Response) {
    // Readable by JS so the SPA can paint a logged-in shell before /auth/session returns.
    res.cookie(SESSION_HINT, '1', {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearSessionHint(res: Response) {
    res.clearCookie(SESSION_HINT, {
      path: '/',
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
    });
  }

  private setTokenCookies(res: Response, token: string, refreshToken?: string) {
    // Keep the access cookie for a day so cold opens usually skip refresh.
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    if (refreshToken) {
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    this.setSessionHint(res);
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req, @Res({ passthrough: true }) res: Response) {
    const { id, token, refreshToken } = await this.authService.login(req.user.id);
    this.setTokenCookies(res, token, refreshToken);
    return { id };
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    const cookiesToClear = ['access_token', 'refresh_token'];

    cookiesToClear.forEach((name) => {
      res.clearCookie(name, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
      });
    });
    this.clearSessionHint(res);

    return res.status(200).json({
      message: 'Logged out and cookies cleared',
    });
  }

  /**
   * One-shot cold open: access cookie, or refresh + new access, then profile.
   * Replaces the SPA's profile → 401 → refresh → profile chain.
   */
  @HttpCode(HttpStatus.OK)
  @Get('session')
  async session(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const access = req.cookies?.['access_token'];
    const refresh = req.cookies?.['refresh_token'];
    const result = await this.authService.resolveSession(access, refresh);

    if (result.accessToken) {
      this.setTokenCookies(
        res,
        result.accessToken,
        result.refreshToken ?? undefined,
      );
    } else {
      this.setSessionHint(res);
    }

    return result.profile;
  }

  /**
   * Short-lived access token for Socket.IO (httpOnly cookies are not sent cross-origin).
   */
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Get('socket-token')
  socketToken(@Req() req: Request & { cookies?: Record<string, string> }) {
    const token = req.cookies?.['access_token'];
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }
    return { token };
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshAuthGuard)
  @Post('refresh')
  async refreshToken(@Req() req, @Res({ passthrough: true }) res: Response) {
    const { id, token } = await this.authService.refreshToken(req.user.id);
    this.setTokenCookies(res, token);
    return { id };
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google/login')
  googleLogin() {}

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req, @Res() res: Response) {
    const { token, refreshToken } = await this.authService.login(req.user.id);
    this.setTokenCookies(res, token, refreshToken);
    res.clearCookie('oauth_timezone', { path: '/' });

    const returnTo = req.cookies?.oauth_return_to as string | undefined;
    res.clearCookie('oauth_return_to', { path: '/' });

    const frontend =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const successUrl = frontend.endsWith('/success')
      ? frontend
      : `${frontend.replace(/\/$/, '')}/success`;
    const redirectTo =
      returnTo && returnTo.startsWith('/')
        ? `${successUrl}?returnTo=${encodeURIComponent(returnTo)}`
        : successUrl;
    res.redirect(redirectTo);
  }
}
