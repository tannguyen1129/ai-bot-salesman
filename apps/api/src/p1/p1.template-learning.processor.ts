import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { P1Service } from './p1.service';

@Injectable()
export class P1TemplateLearningScheduler implements OnModuleInit {
  constructor(@InjectQueue('p1-template-learning') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'promote-candidates',
      {},
      {
        jobId: 'p1-template-learning:promote:repeat',
        repeat: { every: 15 * 60 * 1000 },
        removeOnComplete: 50,
        removeOnFail: 200
      }
    );
  }
}

@Injectable()
@Processor('p1-template-learning')
export class P1TemplateLearningProcessor extends WorkerHost {
  constructor(private readonly p1Service: P1Service) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.p1Service.runTemplateLearningPromote('system-cron');
  }
}
