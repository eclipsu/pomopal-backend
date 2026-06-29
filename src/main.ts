/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { getCorsOriginConfig } from './config/cors.config';
import { SocketIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
    use: (fn: (req: { url: string }, res: unknown, next: () => void) => void) => void;
  };

  expressApp.set('trust proxy', 1);

  // Normalize /socket.io/?… → /socket.io?… for clients that still send a trailing slash.
  expressApp.use((req, _res, next) => {
    if (req.url.startsWith('/socket.io/?')) {
      req.url = req.url.replace('/socket.io/?', '/socket.io?');
    }
    next();
  });

  app.enableCors({
    origin: getCorsOriginConfig(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.use(cookieParser());

  app.useStaticAssets(join(process.cwd(), 'storage'), { prefix: '/storage' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  const port = Number(process.env.PORT) || 8000;
  await app.listen(port, '0.0.0.0');
  console.log(`Server running on port ${port}`);
}

process.on('unhandledRejection', (reason) => {
  console.error('FULL TRACE:', reason);
});

bootstrap();
