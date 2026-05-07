import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { QueueModule } from './queue/queue.module';
import { PgModule } from './database/pg.module';
import { P1Module } from './p1/p1.module';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
  resolve(process.cwd(), '..', '..', '..', '.env')
].filter((path, index, arr) => arr.indexOf(path) === index && existsSync(path));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envCandidates,
      load: [configuration],
      validate: validateEnv
    }),
    QueueModule,
    PgModule,
    P1Module
  ],
  controllers: [HealthController]
})
export class AppModule {}
