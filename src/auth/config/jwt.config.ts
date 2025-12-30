import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'devsecret',
  expiresIn: process.env.JWT_SECRET_EXPIRES_IN || '30d',

  secretRefresh: process.env.REFRESH_JWT_SECRET || 'devsecretrefresh',
  expiresInRefresh: String(process.env.REFRESH_TOKEN_EXPIRES_IN) || '30d',
}));
