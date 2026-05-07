import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const explicitOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowAllByWildcard = explicitOrigins.includes('*');
  const allowAllDevOrigins =
    (process.env.NODE_ENV ?? 'development') !== 'production' &&
    (process.env.CORS_ALLOW_ALL_DEV ?? 'true') === 'true';

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowAllByWildcard || explicitOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const isLocalDevOrigin =
        /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin) ||
        /^https?:\/\/0\.0\.0\.0(:\d+)?$/i.test(origin);
      const isLanIpOrigin = /^https?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/i.test(origin);
      const isLanHostnameOrigin = /^https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::\d+)?$/i.test(
        origin
      );

      callback(null, isLocalDevOrigin || (allowAllDevOrigins && (isLanIpOrigin || isLanHostnameOrigin)));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
