import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuthJwtPayload } from './types/auth-jwtPayload';
import { ConfigService } from '@nestjs/config';
import { CreateUserDto } from 'src/user/dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new UnauthorizedException('User not found');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const withRole = await this.userService.syncAdminRole(user);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = user;
    return { ...result, role: withRole.role };
  }

  async login(userId: string) {
    const user = await this.userService.findOne(userId);
    const payload: AuthJwtPayload = { sub: userId, role: user.role ?? 'user' };

    const token = this.jwtService.sign(payload);

    const refreshOptions: JwtSignOptions = {
      secret: this.configService.getOrThrow<string>('jwt.secretRefresh'),
      expiresIn: '30d',
    };

    const refreshToken = this.jwtService.sign(payload, refreshOptions);

    return { id: userId, token, refreshToken };
  }

  refreshToken(userId: string) {
    return this.login(userId);
  }

  async validateGoogleUser(googleUser: CreateUserDto) {
    let user = await this.userService.findByEmail(googleUser.email);
    if (!user) user = await this.userService.create(googleUser);
    const withRole = await this.userService.syncAdminRole(user);
    return this.userService.findOne(withRole.id);
  }
}
