import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * Vercel rewrites strip the trailing slash from /api/socket.io/?… so the backend
 * receives /socket.io?…. Engine.IO defaults to path /socket.io/ which only matches
 * URLs with a slash before the query string. Disable the trailing slash so both
 * /socket.io?… (production via Vercel) and /socket.io/?… (local direct) work.
 */
export class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      path: '/socket.io',
      addTrailingSlash: false,
    });
  }
}
