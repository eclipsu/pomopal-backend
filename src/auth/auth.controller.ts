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
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { RefreshAuthGuard } from './guards/refresh-auth/refresh-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth/google-auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setTokenCookies(res: Response, token: string, refreshToken?: string) {
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    if (refreshToken) {
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  @Post('login')
  login(@Request() req, @Res({ passthrough: true }) res: Response) {
    const { id, token, refreshToken } = this.authService.login(req.user.id);
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
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    });

    return res.status(200).json({
      message: 'Logged out and cookies cleared',
    });
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshAuthGuard)
  @Post('refresh')
  refreshToken(@Req() req, @Res({ passthrough: true }) res: Response) {
    const { id, token } = this.authService.refreshToken(req.user.id);
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
    const redirectTo =
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000/success';
    res.redirect(redirectTo);
  }
}
