import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host', '127.0.0.1'),
          port: config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password') || undefined,
          family: 4,
          skipVersionCheck: true
        }
      })
    }),
    BullModule.registerQueue(
      { name: 'p1-sheets-sync' },
      { name: 'p1-discovery' },
      { name: 'p1-email-send' }
    )
  ],
  exports: [BullModule]
})
export class QueueModule {}
