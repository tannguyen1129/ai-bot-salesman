import { Injectable, NotFoundException } from '@nestjs/common';
import { PgService } from '../database/pg.service';

interface CandidateRecord {
  id: string;
  job_id: string | null;
  name: string;
  domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  employee_estimate: number | null;
  revenue_estimate: string | null;
  score: string | null;
  status: string;
  source_confidence: string | null;
  source_json: unknown;
  created_at: string;
  updated_at: string;
}

interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class CandidateService {
  constructor(private readonly pg: PgService) {}

  async list(query: {
    jobId?: string;
    status?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<PagedResult<CandidateRecord>> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.jobId) {
      params.push(query.jobId);
      conditions.push(`job_id = $${params.length}`);
    }

    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }

    if (query.q?.trim()) {
      params.push(`%${query.q.trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR COALESCE(domain, '') ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.pg.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM company_candidates
       ${whereClause}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<CandidateRecord>(
      `SELECT *
       FROM company_candidates
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    return {
      items,
      total: countRows[0]?.total ?? 0,
      limit,
      offset
    };
  }

  async getById(id: string) {
    const rows = await this.pg.query<CandidateRecord>(`SELECT * FROM company_candidates WHERE id = $1`, [id]);

    if (!rows[0]) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }

    return rows[0];
  }
}
