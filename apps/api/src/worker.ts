import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

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
