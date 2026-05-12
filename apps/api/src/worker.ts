import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Safety net: prevent the worker from being killed by a stray async error
// (e.g. ImapFlow socket emitting 'error' with no listener due to a race).
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[worker] uncaughtException swallowed:', err);
});
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[worker] unhandledRejection swallowed:', reason);
});

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  // eslint-disable-next-line no-console
  console.log('Worker started: discovery queue consumers are active');

  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrapWorker();
