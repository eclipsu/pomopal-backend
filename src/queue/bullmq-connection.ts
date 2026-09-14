import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';

/** Dedicated BullMQ connection — do not reuse presence Redis client. */
export function bullmqConnection(config: ConfigService): ConnectionOptions {
  const password = config.get<string>('REDIS_PASSWORD')?.trim();
  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    ...(password ? { password } : {}),
    maxRetriesPerRequest: null,
  };
}
