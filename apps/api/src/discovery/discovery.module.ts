import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { DiscoveryProcessor } from './discovery.processor';
import { RapidLinkedinClient } from '../integrations/rapid-linkedin.client';
import { PgService } from '../database/pg.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'discovery' })],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, DiscoveryProcessor, RapidLinkedinClient, PgService]
})
export class DiscoveryModule {}
