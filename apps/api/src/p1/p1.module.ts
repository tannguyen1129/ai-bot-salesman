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
import { P1TemplateLearningProcessor, P1TemplateLearningScheduler } from './p1.template-learning.processor';
import { P1BounceListenerService } from './p1.bounce-listener.service';
import { P1TelegramSnoozeProcessor } from './p1.telegram-snooze.processor';

/**
 * Detects whether this Node process is the worker (BullMQ consumer + IMAP poller)
 * or the API HTTP server. The same image runs both; docker-compose sets the env.
 * Falls back to argv detection so local `npm run worker` also works without env.
 */
function isWorkerProcess(): boolean {
  const explicit = (process.env.P1_PROCESS_ROLE ?? '').trim().toLowerCase();
  if (explicit === 'worker') return true;
  if (explicit === 'api') return false;
  const argv = (process.argv[1] ?? '').toLowerCase();
  return argv.endsWith('worker.js') || argv.endsWith('worker.ts');
}

// Heavy background-job providers (BullMQ Worker hosts + IMAP listener) only get
// instantiated in the worker process. The API process still enqueues jobs via
// the queues registered above — BullModule.registerQueue gives both processes
// an `@InjectQueue` handle without forcing them to consume.
const WORKER_PROVIDERS = [
  P1SheetSyncProcessor,
  P1DiscoveryProcessor,
  P1EmailSendProcessor,
  P1TemplateLearningProcessor,
  P1TemplateLearningScheduler,
  P1BounceListenerService,
  P1TelegramSnoozeProcessor
];

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'p1-sheets-sync' },
      { name: 'p1-discovery' },
      { name: 'p1-email-send' },
      { name: 'p1-template-learning' },
      { name: 'p1-telegram-snooze' }
    )
  ],
  controllers: [P1Controller],
  providers: [
    P1Service,
    P1TelegramService,
    RapidLinkedinClient,
    HunterClient,
    ApolloClient,
    CompanyCrawlerClient,
    OpenAiClient,
    ...(isWorkerProcess() ? WORKER_PROVIDERS : [])
  ]
})
export class P1Module {}
