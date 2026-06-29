import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtAuthGuard } from '../jwt-auth/jwt-auth.guard';
import type { AuthJwtPayload } from '../../types/auth-jwtPayload';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AdminGuard extends JwtAuthGuard implements CanActivate {
  constructor(private readonly userService: UserService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest<{ user?: AuthJwtPayload }>();
    const userId = req.user?.sub;
    if (!userId) throw new ForbiddenException('Admin access required');

    const user = await this.userService.findOne(String(userId));
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
