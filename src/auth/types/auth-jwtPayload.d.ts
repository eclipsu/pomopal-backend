import type { UserRole } from 'src/entities/user.entity';

export type AuthJwtPayload = {
  sub: string;
  role: UserRole;
};
