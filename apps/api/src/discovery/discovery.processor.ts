import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { RapidLinkedinClient } from '../integrations/rapid-linkedin.client';
import { PgService } from '../database/pg.service';

interface DiscoveryPayload {
  jobId: string;
  icpId: string;
  source: string;
}

interface IcpSnapshot {
  id: string;
  name: string;
  industries: string[];
  countries: string[];
  target_roles: string[];
  pain_keywords: string[];
  product_focus: string[];
}

interface CandidateDraft {
  name: string;
  linkedinUrl: string | null;
  industry: string | null;
  employeeEstimate: number | null;
  domain: string | null;
  sourceConfidence: number;
  sourceJson: unknown;
}

@Injectable()
@Processor('discovery')
export class DiscoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DiscoveryProcessor.name);

  constructor(
    private readonly rapidLinkedin: RapidLinkedinClient,
    private readonly pg: PgService
  ) {
    super();
  }

  async process(job: Job<DiscoveryPayload>): Promise<void> {
    this.logger.log(`Processing discovery job ${job.data.jobId}`);

    try {
      await this.pg.query(`UPDATE discovery_jobs SET status='running', started_at=now() WHERE id=$1`, [
        job.data.jobId
      ]);

      const icp = await this.getIcpSnapshot(job.data.icpId);
      const queries = this.buildQueriesFromIcp(icp);

      const mergedCandidates: CandidateDraft[] = [];
      let totalRawItems = 0;

      for (const query of queries) {
        const raw = await this.rapidLinkedin.searchPeople({ keywords: query, page: 1 });
        totalRawItems += raw.items.length;

        await this.pg.query(
          `INSERT INTO external_api_requests (provider, endpoint, request_hash, status_code, latency_ms)
           VALUES ('rapidapi-linkedin', '/search-people', $1, 200, 0)
           ON CONFLICT (provider, endpoint, request_hash) DO NOTHING`,
          [`${job.data.jobId}:${query}`]
        );

        await this.pg.query(
          `INSERT INTO raw_external_records (provider, record_type, external_id, raw_json)
           VALUES ('rapidapi-linkedin', 'search-people', $1, $2::jsonb)`,
          [job.data.jobId, JSON.stringify({ query, raw })]
        );

        mergedCandidates.push(...this.extractCandidates(raw.items));
      }

      const uniqueCandidates = this.uniqueCandidates(mergedCandidates);
      const ingestedCount = await this.ingestCandidates(job.data.jobId, uniqueCandidates);

      await this.pg.query(
        `UPDATE discovery_jobs
         SET status='completed', finished_at=now(), total_found=$2, total_scored=$3
         WHERE id=$1`,
        [job.data.jobId, ingestedCount, 0]
      );

      this.logger.log(
        `Discovery job ${job.data.jobId} completed. queries=${queries.length}, raw=${totalRawItems}, inserted=${ingestedCount}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown discovery error';

      await this.pg.query(
        `UPDATE discovery_jobs
         SET status='failed', finished_at=now(), error_message=$2
         WHERE id=$1`,
        [job.data.jobId, message]
      );

      throw error;
    }
  }

  private async getIcpSnapshot(icpId: string): Promise<IcpSnapshot> {
    const rows = await this.pg.query<IcpSnapshot>(
      `SELECT id, name, industries, countries, target_roles, pain_keywords, product_focus
       FROM icp_profiles
       WHERE id = $1`,
      [icpId]
    );

    if (!rows[0]) {
      throw new Error(`ICP ${icpId} not found`);
    }

    return {
      ...rows[0],
      industries: Array.isArray(rows[0].industries) ? rows[0].industries : [],
      countries: Array.isArray(rows[0].countries) ? rows[0].countries : [],
      target_roles: Array.isArray(rows[0].target_roles) ? rows[0].target_roles : [],
      pain_keywords: Array.isArray(rows[0].pain_keywords) ? rows[0].pain_keywords : [],
      product_focus: Array.isArray(rows[0].product_focus) ? rows[0].product_focus : []
    };
  }

  private buildQueriesFromIcp(icp: IcpSnapshot): string[] {
    const base = [icp.name, ...icp.industries.slice(0, 2), ...icp.product_focus.slice(0, 1)]
      .filter(Boolean)
      .join(' ')
      .trim();

    const roles = icp.target_roles.slice(0, 2).join(' ');
    const pains = icp.pain_keywords.slice(0, 2).join(' ');
    const countries = icp.countries.slice(0, 2).join(' ');

    const queries = [
      `${base} enterprise ${countries}`.trim(),
      `${base} ${roles} ${countries}`.trim(),
      `${base} ${pains} ${countries}`.trim()
    ].filter((query) => query.length > 0);

    return Array.from(new Set(queries)).slice(0, 3);
  }

  private extractCandidates(items: unknown[]): CandidateDraft[] {
    const candidates: CandidateDraft[] = [];

    for (const item of items) {
      const source = item as Record<string, unknown>;

      const name = this.pickFirstString(source, [
        'companyName',
        'currentCompanyName',
        'organizationName',
        'name',
        'fullName'
      ]);

      if (!name) {
        continue;
      }

      const linkedinUrl = this.pickFirstString(source, ['companyLinkedinUrl', 'linkedinUrl', 'url']);
      const industry = this.pickFirstString(source, ['industry', 'companyIndustry']);
      const domain = this.pickFirstString(source, ['companyDomain', 'domain', 'website']);
      const employeeEstimate = this.pickFirstNumber(source, [
        'companyEmployeeCount',
        'employeeCount',
        'employees'
      ]);

      candidates.push({
        name,
        linkedinUrl: linkedinUrl ?? null,
        industry: industry ?? null,
        employeeEstimate: employeeEstimate ?? null,
        domain: domain ?? null,
        sourceConfidence: 0.6,
        sourceJson: source
      });
    }

    return candidates;
  }

  private uniqueCandidates(candidates: CandidateDraft[]): CandidateDraft[] {
    const seen = new Set<string>();
    const unique: CandidateDraft[] = [];

    for (const candidate of candidates) {
      const key = candidate.linkedinUrl
        ? `linkedin:${candidate.linkedinUrl.toLowerCase()}`
        : `name:${candidate.name.toLowerCase()}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      unique.push(candidate);
    }

    return unique;
  }

  private async ingestCandidates(jobId: string, candidates: CandidateDraft[]): Promise<number> {
    let inserted = 0;

    for (const candidate of candidates) {
      const dedupRows = candidate.linkedinUrl
        ? await this.pg.query<{ id: string }>(
            `SELECT id
             FROM company_candidates
             WHERE job_id = $1 AND linkedin_url = $2
             LIMIT 1`,
            [jobId, candidate.linkedinUrl]
          )
        : await this.pg.query<{ id: string }>(
            `SELECT id
             FROM company_candidates
             WHERE job_id = $1 AND lower(name) = lower($2)
             LIMIT 1`,
            [jobId, candidate.name]
          );

      if (dedupRows[0]) {
        continue;
      }

      await this.pg.query(
        `INSERT INTO company_candidates (
           job_id, name, domain, linkedin_url, industry, employee_estimate,
           source_confidence, source_json, status
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8::jsonb, 'new'
         )`,
        [
          jobId,
          candidate.name,
          candidate.domain,
          candidate.linkedinUrl,
          candidate.industry,
          candidate.employeeEstimate,
          candidate.sourceConfidence,
          JSON.stringify(candidate.sourceJson)
        ]
      );

      inserted += 1;
    }

    return inserted;
  }

  private pickFirstString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private pickFirstNumber(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value.replaceAll(',', ''));
        if (Number.isFinite(parsed)) {
          return Math.trunc(parsed);
        }
      }
    }

    return null;
  }
}
