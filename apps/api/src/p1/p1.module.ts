import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { P1Controller } from './p1.controller';
import { P1Service } from './p1.service';
import { P1SheetSyncProcessor } from './p1.sheet-sync.processor';
import { P1DiscoveryProcessor } from './p1.discovery.processor';
import { P1EmailSendProcessor } from './p1.email-send.processor';
import { RapidLinkedinClient } from '../integrations/rapid-linkedin.client';
import { HunterClient } from '../integrations/hunter.client';
import { ApolloClient } from '../integrations/apollo.client';
import { CompanyCrawlerClient } from '../integrations/company-crawler.client';
import { OpenAiClient } from '../integrations/openai.client';
import { P1TelegramService } from './p1.telegram.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'p1-sheets-sync' }, { name: 'p1-discovery' }, { name: 'p1-email-send' })],
  controllers: [P1Controller],
  providers: [
    P1Service,
    P1SheetSyncProcessor,
    P1DiscoveryProcessor,
    P1EmailSendProcessor,
    P1TelegramService,
    RapidLinkedinClient,
    HunterClient,
    ApolloClient,
    CompanyCrawlerClient,
    OpenAiClient
  ]
})
export class P1Module {}
