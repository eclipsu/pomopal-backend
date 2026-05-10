import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const RedisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: (config: ConfigService): Redis => {
    const client = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD'),
      retryStrategy: (times) => Math.min(times * 200, 10_000),
      lazyConnect: false,
    });

    client.on('connect', () => console.log('[Redis] Connected'));
    client.on('error', (err) => console.error('[Redis] Error:', err.message));

    return client;
  },
  inject: [ConfigService],
};
