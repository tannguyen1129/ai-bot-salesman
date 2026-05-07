import { Injectable, NotFoundException } from '@nestjs/common';
import { PgService } from '../database/pg.service';
import { CreateIcpProfileDto, UpdateIcpProfileDto } from './icp.dto';

interface IcpProfileRecord {
  id: string;
  name: string;
  industries: unknown;
  countries: unknown;
  revenue_min: string | null;
  employee_min: number | null;
  target_roles: unknown;
  pain_keywords: unknown;
  product_focus: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface IcpProfileWithStatsRecord extends IcpProfileRecord {
  total_jobs: number;
  jobs_queued: number;
  jobs_running: number;
  jobs_completed: number;
  jobs_failed: number;
  total_candidates: number;
}

interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class IcpService {
  constructor(private readonly pg: PgService) {}

  async create(dto: CreateIcpProfileDto): Promise<IcpProfileRecord> {
    const rows = await this.pg.query<IcpProfileRecord>(
      `INSERT INTO icp_profiles (
        name, industries, countries, revenue_min, employee_min, target_roles, pain_keywords, product_focus, is_active
      ) VALUES (
        $1, $2::jsonb, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9
      )
      RETURNING *`,
      [
        dto.name,
        JSON.stringify(dto.industries),
        JSON.stringify(dto.countries),
        dto.revenueMin ?? null,
        dto.employeeMin ?? null,
        JSON.stringify(dto.targetRoles),
        JSON.stringify(dto.painKeywords),
        JSON.stringify(dto.productFocus),
        dto.isActive ?? true
      ]
    );

    return rows[0];
  }

  async list(query: {
    q?: string;
    active?: 'active' | 'inactive';
    limit?: number;
    offset?: number;
  }): Promise<PagedResult<IcpProfileWithStatsRecord>> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    const filters: string[] = [];
    const params: unknown[] = [];

    if (query.q?.trim()) {
      params.push(`%${query.q.trim()}%`);
      filters.push(`i.name ILIKE $${params.length}`);
    }

    if (query.active) {
      params.push(query.active === 'active');
      filters.push(`i.is_active = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const countRows = await this.pg.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM icp_profiles i ${whereClause}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<IcpProfileWithStatsRecord>(
      `${this.baseStatsSelect()}
       ${whereClause}
       ORDER BY i.created_at DESC
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

  async getById(id: string): Promise<IcpProfileWithStatsRecord> {
    const rows = await this.pg.query<IcpProfileWithStatsRecord>(
      `${this.baseStatsSelect()}
       WHERE i.id = $1`,
      [id]
    );

    if (!rows[0]) {
      throw new NotFoundException(`ICP profile ${id} not found`);
    }

    return rows[0];
  }

  async update(id: string, dto: UpdateIcpProfileDto): Promise<IcpProfileWithStatsRecord> {
    const current = await this.getById(id);

    await this.pg.query<IcpProfileRecord>(
      `UPDATE icp_profiles
       SET name = $2,
           industries = $3::jsonb,
           countries = $4::jsonb,
           revenue_min = $5,
           employee_min = $6,
           target_roles = $7::jsonb,
           pain_keywords = $8::jsonb,
           product_focus = $9::jsonb,
           is_active = $10,
           updated_at = now()
       WHERE id = $1`,
      [
        id,
        dto.name ?? current.name,
        JSON.stringify(dto.industries ?? current.industries),
        JSON.stringify(dto.countries ?? current.countries),
        dto.revenueMin ?? current.revenue_min,
        dto.employeeMin ?? current.employee_min,
        JSON.stringify(dto.targetRoles ?? current.target_roles),
        JSON.stringify(dto.painKeywords ?? current.pain_keywords),
        JSON.stringify(dto.productFocus ?? current.product_focus),
        dto.isActive ?? current.is_active
      ]
    );

    return this.getById(id);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const deleted = await this.pg.query<{ id: string }>(
      `DELETE FROM icp_profiles WHERE id = $1 RETURNING id`,
      [id]
    );

    if (!deleted[0]) {
      throw new NotFoundException(`ICP profile ${id} not found`);
    }

    return { deleted: true };
  }

  private baseStatsSelect(): string {
    return `
      SELECT
        i.*,
        COALESCE(j.total_jobs, 0) AS total_jobs,
        COALESCE(j.jobs_queued, 0) AS jobs_queued,
        COALESCE(j.jobs_running, 0) AS jobs_running,
        COALESCE(j.jobs_completed, 0) AS jobs_completed,
        COALESCE(j.jobs_failed, 0) AS jobs_failed,
        COALESCE(c.total_candidates, 0) AS total_candidates
      FROM icp_profiles i
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_jobs,
          COUNT(*) FILTER (WHERE dj.status = 'queued')::int AS jobs_queued,
          COUNT(*) FILTER (WHERE dj.status = 'running')::int AS jobs_running,
          COUNT(*) FILTER (WHERE dj.status = 'completed')::int AS jobs_completed,
          COUNT(*) FILTER (WHERE dj.status = 'failed')::int AS jobs_failed
        FROM discovery_jobs dj
        WHERE dj.icp_id = i.id
      ) j ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS total_candidates
        FROM company_candidates cc
        INNER JOIN discovery_jobs dj2 ON dj2.id = cc.job_id
        WHERE dj2.icp_id = i.id
      ) c ON TRUE
    `;
  }
}
