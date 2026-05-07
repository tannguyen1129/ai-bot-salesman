import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { JobState, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PgService } from '../database/pg.service';

interface DiscoveryJobRecord {
  id: string;
  icp_id: string;
  source: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  total_found: number;
  total_scored: number;
  error_message: string | null;
  created_at: string;
}

interface QueueJobSnapshot {
  state: JobState | 'missing' | 'unknown';
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number | null;
  processedOn: number | null;
  finishedOn: number | null;
}

interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class DiscoveryService {
  constructor(
    @InjectQueue('discovery') private readonly discoveryQueue: Queue,
    private readonly pg: PgService
  ) {}

  async queueDiscovery(icpId: string, source: string): Promise<{ jobId: string }> {
    const jobId = randomUUID();

    await this.pg.query(
      `INSERT INTO discovery_jobs (id, icp_id, source, status) VALUES ($1, $2, $3, 'queued')`,
      [jobId, icpId, source]
    );

    await this.discoveryQueue.add(
      'run-discovery-job',
      { jobId, icpId, source },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000
        },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    );

    return { jobId };
  }

  async listJobs(query: { status?: string; limit?: number; offset?: number }): Promise<PagedResult<DiscoveryJobRecord & { queue: QueueJobSnapshot }>> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    const params: unknown[] = [];
    let where = '';

    if (query.status) {
      params.push(query.status);
      where = `WHERE status = $${params.length}`;
    }

    const countRows = await this.pg.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM discovery_jobs ${where}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const rows = await this.pg.query<DiscoveryJobRecord>(
      `SELECT *
       FROM discovery_jobs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    const items = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        queue: await this.getQueueSnapshot(row.id)
      }))
    );

    return {
      items,
      total: countRows[0]?.total ?? 0,
      limit,
      offset
    };
  }

  async getJobById(id: string) {
    const rows = await this.pg.query<DiscoveryJobRecord>(`SELECT * FROM discovery_jobs WHERE id = $1`, [id]);

    if (!rows[0]) {
      throw new NotFoundException(`Discovery job ${id} not found`);
    }

    return {
      ...rows[0],
      queue: await this.getQueueSnapshot(id)
    };
  }

  private async getQueueSnapshot(jobId: string): Promise<QueueJobSnapshot> {
    const queueJob = await this.discoveryQueue.getJob(jobId);

    if (!queueJob) {
      return {
        state: 'missing',
        attemptsMade: 0,
        failedReason: null,
        timestamp: null,
        processedOn: null,
        finishedOn: null
      };
    }

    return {
      state: await queueJob.getState(),
      attemptsMade: queueJob.attemptsMade,
      failedReason: queueJob.failedReason ?? null,
      timestamp: queueJob.timestamp ?? null,
      processedOn: queueJob.processedOn ?? null,
      finishedOn: queueJob.finishedOn ?? null
    };
  }
}
