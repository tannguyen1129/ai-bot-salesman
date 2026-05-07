import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { createHash, randomUUID } from 'crypto';
import { PgService } from '../database/pg.service';
import { HunterClient, HunterContactCandidate } from '../integrations/hunter.client';
import {
  LinkedinCompanyCandidate,
  LinkedinCompanyProfile,
  RapidLinkedinClient
} from '../integrations/rapid-linkedin.client';
import { ApolloClient, ApolloCompanyCandidate, ApolloPersonCandidate } from '../integrations/apollo.client';
import { CompanyCrawlerClient, CrawledCompanyData } from '../integrations/company-crawler.client';

interface P1DiscoveryPayload {
  searchJobId: string;
}

interface SearchJobSnapshot {
  id: string;
  keyword: string;
  region: string | null;
}

interface RawSnapshotRow {
  raw_json: unknown;
}

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
}

type KeyPersonSource = 'hunter' | 'apollo' | 'multi';

interface UnifiedKeyPersonCandidate {
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  confidence: number;
  source: KeyPersonSource;
  seniority: string | null;
  location: string | null;
  raw: Record<string, unknown>;
}

@Injectable()
@Processor('p1-discovery')
export class P1DiscoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(P1DiscoveryProcessor.name);
  private readonly rapidApiCacheHours: number;
  private readonly hunterCacheHours: number;
  private readonly apolloCacheHours: number;
  private readonly crawlerCacheHours: number;
  private readonly apolloPeopleLimit: number;
  private readonly apolloEnrichTopN: number;

  constructor(
    private readonly pg: PgService,
    private readonly rapidLinkedin: RapidLinkedinClient,
    private readonly hunter: HunterClient,
    private readonly apollo: ApolloClient,
    private readonly crawler: CompanyCrawlerClient,
    @InjectQueue('p1-sheets-sync') private readonly syncQueue: Queue
  ) {
    super();
    this.rapidApiCacheHours = Math.max(1, Number(process.env.RAPIDAPI_CACHE_TTL_HOURS ?? 24));
    this.hunterCacheHours = Math.max(1, Number(process.env.HUNTER_CACHE_TTL_HOURS ?? 24));
    this.apolloCacheHours = Math.max(1, Number(process.env.APOLLO_CACHE_TTL_HOURS ?? 24));
    this.crawlerCacheHours = Math.max(1, Number(process.env.CRAWLER_CACHE_TTL_HOURS ?? 24));
    this.apolloPeopleLimit = Math.max(1, Number(process.env.APOLLO_PEOPLE_LIMIT ?? 5));
    this.apolloEnrichTopN = Math.max(0, Number(process.env.APOLLO_ENRICH_TOP_N ?? 2));
  }

  async process(job: Job<P1DiscoveryPayload>): Promise<void> {
    const searchJobId = job.data.searchJobId;
    const searchJob = await this.getSearchJob(searchJobId);
    const auditId = randomUUID();

    await this.pg.query(
      `UPDATE search_jobs
       SET status='running', started_at=COALESCE(started_at, now()), error_message=NULL, updated_at=now()
       WHERE id = $1`,
      [searchJobId]
    );

    await this.writeAudit(auditId, 'search_job.discovery.started', 'search_job', searchJobId, {
      companyName: searchJob.keyword
    });

    try {
      const companyQuery = this.buildCompanyQuery(searchJob);
      const companies = await this.findCompaniesWithCache(searchJobId, companyQuery, searchJob.region);
      const prioritizedCompanies = this.buildDiscoveryCompanies(searchJob.keyword, companies).slice(0, 3);

      let prospectsCreated = 0;
      let keyPersonsProcessed = 0;

      for (let index = 0; index < prioritizedCompanies.length; index += 1) {
        const candidate = prioritizedCompanies[index];

        if (index > 0) {
          await this.respectRateLimit('RAPIDAPI_RATE_LIMIT_PER_MINUTE', 60);
        }

        const profile = await this.getCompanyProfileWithCache(searchJobId, candidate);
        let enrichedCandidate = this.applyCompanyProfile(candidate, profile);

        await this.respectRateLimit('CRAWLER_RATE_LIMIT_PER_MINUTE', 20);
        const crawlData = await this.crawlCompanyWithCache(searchJobId, enrichedCandidate);
        enrichedCandidate = this.applyCrawledData(enrichedCandidate, crawlData);

        await this.respectRateLimit('APOLLO_RATE_LIMIT_PER_MINUTE', 30);
        const apolloCompany = await this.findApolloCompanyWithCache(searchJobId, enrichedCandidate);
        enrichedCandidate = this.applyApolloCompanyData(enrichedCandidate, apolloCompany);

        const company = await this.upsertCompany(searchJobId, enrichedCandidate);
        const companyDomain = this.normalizeDomain(
          company.domain ?? enrichedCandidate.domain ?? crawlData?.canonicalDomain ?? apolloCompany?.domain ?? null
        );
        const hunterContacts = companyDomain
          ? await (async () => {
              await this.respectRateLimit('HUNTER_RATE_LIMIT_PER_MINUTE', 30);
              return this.findContactsWithCache(searchJobId, companyDomain);
            })()
          : [];

        await this.respectRateLimit('APOLLO_RATE_LIMIT_PER_MINUTE', 30);
        const apolloPeople = await this.findApolloPeopleWithCache(
          searchJobId,
          company.name,
          companyDomain,
          this.apolloPeopleLimit
        );

        const enrichedApolloPeople = await this.enrichApolloTopCandidates(searchJobId, companyDomain, apolloPeople);
        const hunterCandidates = this.prioritizeKeyPersons(
          hunterContacts.map((item) => this.toUnifiedFromHunter(item))
        );
        const apolloCandidates = this.prioritizeKeyPersons(
          enrichedApolloPeople.map((item) => this.toUnifiedFromApollo(item))
        );
        const keyPersons = this.composeKeyPersonsWithoutMerge(hunterCandidates, apolloCandidates).slice(0, 5);

        for (const keyPerson of keyPersons) {
          const contactId = await this.upsertContact(searchJobId, company, keyPerson);
          keyPersonsProcessed += 1;

          await this.saveKeyPersonSnapshot(searchJobId, contactId, company.id, keyPerson);

          const prospectId = await this.createProspectIfNeeded(searchJobId, company, contactId, keyPerson);
          if (!prospectId) {
            continue;
          }

          prospectsCreated += 1;
          await this.enqueueSheetSync(prospectId);
        }
      }

      await this.pg.query(
        `UPDATE search_jobs
         SET status='completed', completed_at=now(), total_prospects=$2, updated_at=now()
         WHERE id = $1`,
        [searchJobId, prospectsCreated]
      );

      await this.writeAudit(auditId, 'search_job.discovery.completed', 'search_job', searchJobId, {
        companies: prioritizedCompanies.length,
        keyPersons: keyPersonsProcessed,
        prospectsCreated
      });

      this.logger.log(
        `P1 discovery completed: job=${searchJobId} companies=${prioritizedCompanies.length} keyPersons=${keyPersonsProcessed} prospects=${prospectsCreated}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown P1 discovery error';
      await this.pg.query(
        `UPDATE search_jobs
         SET status='failed', completed_at=now(), error_message=$2, updated_at=now()
         WHERE id = $1`,
        [searchJobId, message]
      );
      await this.writeAudit(auditId, 'search_job.discovery.failed', 'search_job', searchJobId, {
        error: message
      });
      throw error;
    }
  }

  private async getSearchJob(searchJobId: string): Promise<SearchJobSnapshot> {
    const rows = await this.pg.query<SearchJobSnapshot>(
      `SELECT id, keyword, region
       FROM search_jobs
       WHERE id = $1`,
      [searchJobId]
    );

    if (!rows[0]) {
      throw new Error(`search_job ${searchJobId} not found`);
    }

    return rows[0];
  }

  private buildCompanyQuery(searchJob: SearchJobSnapshot): string {
    return [searchJob.keyword, searchJob.region]
      .map((value) => (value ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private prioritizeCompaniesByQuery(
    companyQuery: string,
    companies: LinkedinCompanyCandidate[]
  ): LinkedinCompanyCandidate[] {
    const deduped = this.deduplicateCompanies(companies);
    const tokens = this.tokenize(companyQuery);

    return deduped
      .map((company) => {
        const nameTokens = this.tokenize(company.name);
        const matchCount = tokens.filter((token) => nameTokens.includes(token)).length;
        const score = tokens.length > 0 ? matchCount / tokens.length : 0;
        return { company, score };
      })
      .filter((item) => item.score >= 0.25 || tokens.length === 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.company);
  }

  private buildDiscoveryCompanies(
    companyQuery: string,
    companies: LinkedinCompanyCandidate[]
  ): LinkedinCompanyCandidate[] {
    const prioritized = this.prioritizeCompaniesByQuery(companyQuery, companies);
    if (prioritized.length > 0) {
      return prioritized;
    }

    const fallbackName = companyQuery.trim();
    if (!fallbackName) {
      return [];
    }

    // Keep the pipeline alive even when search-companies has no hits.
    // Apollo/key-person lookup can still discover contacts from company name.
    return [
      {
        name: fallbackName,
        domain: null,
        linkedinUrl: null,
        industry: null,
        region: null,
        employeeEstimate: null,
        raw: {
          provider: 'fallback',
          reason: 'no_company_search_results',
          query: fallbackName
        }
      }
    ];
  }

  private async findCompaniesWithCache(
    searchJobId: string,
    queryText: string,
    region: string | null
  ): Promise<LinkedinCompanyCandidate[]> {
    const requestHash = this.hashPayload({ queryText, region: region ?? null });

    const cachedRows = await this.pg.query<RawSnapshotRow>(
      `SELECT raw_json
       FROM raw_data_snapshots
       WHERE source = 'rapidapi-linkedin'
         AND entity_type = 'company-search'
         AND content_hash = $1
         AND created_at >= now() - ($2::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestHash, this.rapidApiCacheHours]
    );

    if (cachedRows[0]) {
      const cached = cachedRows[0].raw_json as Record<string, unknown>;
      const items = Array.isArray(cached?.items) ? (cached.items as LinkedinCompanyCandidate[]) : [];
      return items;
    }

    const started = Date.now();
    const result = await this.rapidLinkedin.searchCompanies({
      keywords: queryText,
      region: region ?? undefined,
      page: 1
    });
    const latencyMs = Date.now() - started;

    await this.pg.query(
      `INSERT INTO external_api_requests (
         provider, endpoint, request_hash, status_code, latency_ms, search_job_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, endpoint, request_hash)
       DO UPDATE SET
         status_code = EXCLUDED.status_code,
         latency_ms = EXCLUDED.latency_ms,
         search_job_id = EXCLUDED.search_job_id,
         created_at = now()`,
      ['rapidapi-linkedin', '/search-companies', requestHash, 200, latencyMs, searchJobId]
    );

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'rapidapi-linkedin',
        'company-search',
        searchJobId,
        JSON.stringify({ queryText, region, items: result.items, raw: result.raw }),
        requestHash
      ]
    );

    return result.items;
  }

  private async getCompanyProfileWithCache(
    searchJobId: string,
    candidate: LinkedinCompanyCandidate
  ): Promise<LinkedinCompanyProfile> {
    const key = candidate.linkedinUrl ?? candidate.domain ?? candidate.name;
    const requestHash = this.hashPayload({ company: key });

    const cachedRows = await this.pg.query<RawSnapshotRow>(
      `SELECT raw_json
       FROM raw_data_snapshots
       WHERE source = 'rapidapi-linkedin'
         AND entity_type = 'company-profile'
         AND content_hash = $1
         AND created_at >= now() - ($2::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestHash, this.rapidApiCacheHours]
    );

    if (cachedRows[0]) {
      const cached = cachedRows[0].raw_json as Record<string, unknown>;
      const profile = cached?.profile as LinkedinCompanyProfile | undefined;
      if (profile) {
        return profile;
      }
    }

    const started = Date.now();
    const profile = await this.rapidLinkedin.getCompanyProfile(candidate);
    const latencyMs = Date.now() - started;

    await this.pg.query(
      `INSERT INTO external_api_requests (
         provider, endpoint, request_hash, status_code, latency_ms, search_job_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, endpoint, request_hash)
       DO UPDATE SET
         status_code = EXCLUDED.status_code,
         latency_ms = EXCLUDED.latency_ms,
         search_job_id = EXCLUDED.search_job_id,
         created_at = now()`,
      ['rapidapi-linkedin', '/company-details', requestHash, 200, latencyMs, searchJobId]
    );

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'rapidapi-linkedin',
        'company-profile',
        key,
        JSON.stringify({ profile }),
        requestHash
      ]
    );

    return profile;
  }

  private async crawlCompanyWithCache(
    searchJobId: string,
    candidate: LinkedinCompanyCandidate
  ): Promise<CrawledCompanyData | null> {
    const normalizedDomain = this.normalizeDomain(candidate.domain);
    if (!normalizedDomain) {
      return null;
    }

    const requestHash = this.hashPayload({
      companyName: candidate.name,
      domain: normalizedDomain,
      linkedinUrl: candidate.linkedinUrl
    });

    const cachedRows = await this.pg.query<RawSnapshotRow>(
      `SELECT raw_json
       FROM raw_data_snapshots
       WHERE source = 'crawler-bot'
         AND entity_type = 'company-crawl'
         AND content_hash = $1
         AND created_at >= now() - ($2::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestHash, this.crawlerCacheHours]
    );

    if (cachedRows[0]) {
      const cached = cachedRows[0].raw_json as Record<string, unknown>;
      const crawl = cached?.crawl as CrawledCompanyData | undefined;
      if (crawl) {
        return crawl;
      }
    }

    const started = Date.now();
    const crawl = await this.crawler.crawlCompany({
      companyName: candidate.name,
      domain: normalizedDomain,
      websiteUrl: candidate.domain
    });
    const latencyMs = Date.now() - started;

    await this.pg.query(
      `INSERT INTO external_api_requests (
         provider, endpoint, request_hash, status_code, latency_ms, search_job_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, endpoint, request_hash)
       DO UPDATE SET
         status_code = EXCLUDED.status_code,
         latency_ms = EXCLUDED.latency_ms,
         search_job_id = EXCLUDED.search_job_id,
         created_at = now()`,
      [
        'crawler-bot',
        '/crawl-company',
        requestHash,
        crawl.pages.length > 0 ? 200 : 204,
        latencyMs,
        searchJobId
      ]
    );

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'crawler-bot',
        'company-crawl',
        normalizedDomain,
        JSON.stringify({ crawl }),
        requestHash
      ]
    );

    return crawl;
  }

  private async findApolloCompanyWithCache(
    searchJobId: string,
    candidate: LinkedinCompanyCandidate
  ): Promise<ApolloCompanyCandidate | null> {
    const normalizedDomain = this.normalizeDomain(candidate.domain);
    const requestHash = this.hashPayload({
      companyName: candidate.name,
      domain: normalizedDomain
    });

    const cachedRows = await this.pg.query<RawSnapshotRow>(
      `SELECT raw_json
       FROM raw_data_snapshots
       WHERE source = 'apollo'
         AND entity_type = 'company-search'
         AND content_hash = $1
         AND created_at >= now() - ($2::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestHash, this.apolloCacheHours]
    );

    if (cachedRows[0]) {
      const cached = cachedRows[0].raw_json as Record<string, unknown>;
      const item = cached?.item as ApolloCompanyCandidate | undefined;
      if (item) {
        return item;
      }
      return null;
    }

    const started = Date.now();
    const result = await this.apollo.searchCompany({
      companyName: candidate.name,
      domain: normalizedDomain
    });
    const latencyMs = Date.now() - started;

    await this.pg.query(
      `INSERT INTO external_api_requests (
         provider, endpoint, request_hash, status_code, latency_ms, search_job_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, endpoint, request_hash)
       DO UPDATE SET
         status_code = EXCLUDED.status_code,
         latency_ms = EXCLUDED.latency_ms,
         search_job_id = EXCLUDED.search_job_id,
         created_at = now()`,
      ['apollo', '/mixed_companies/search', requestHash, 200, latencyMs, searchJobId]
    );

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'apollo',
        'company-search',
        normalizedDomain ?? candidate.name,
        JSON.stringify({ item: result.item, raw: result.raw }),
        requestHash
      ]
    );

    return result.item;
  }

  private async findApolloPeopleWithCache(
    searchJobId: string,
    companyName: string,
    companyDomain: string | null,
    limit: number
  ): Promise<ApolloPersonCandidate[]> {
    const requestHash = this.hashPayload({ companyName, companyDomain: companyDomain ?? null, limit });

    const cachedRows = await this.pg.query<RawSnapshotRow>(
      `SELECT raw_json
       FROM raw_data_snapshots
       WHERE source = 'apollo'
         AND entity_type = 'people-search'
         AND content_hash = $1
         AND created_at >= now() - ($2::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestHash, this.apolloCacheHours]
    );

    if (cachedRows[0]) {
      const cached = cachedRows[0].raw_json as Record<string, unknown>;
      const items = Array.isArray(cached?.items) ? (cached.items as ApolloPersonCandidate[]) : [];
      return items;
    }

    const started = Date.now();
    const result = await this.apollo.searchPeople({
      companyName,
      domain: companyDomain ?? undefined,
      limit
    });
    const latencyMs = Date.now() - started;

    await this.pg.query(
      `INSERT INTO external_api_requests (
         provider, endpoint, request_hash, status_code, latency_ms, search_job_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, endpoint, request_hash)
       DO UPDATE SET
         status_code = EXCLUDED.status_code,
         latency_ms = EXCLUDED.latency_ms,
         search_job_id = EXCLUDED.search_job_id,
         created_at = now()`,
      ['apollo', '/mixed_people/api_search', requestHash, 200, latencyMs, searchJobId]
    );

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'apollo',
        'people-search',
        companyDomain ?? companyName,
        JSON.stringify({ items: result.items, raw: result.raw }),
        requestHash
      ]
    );

    return result.items;
  }

  private async enrichApolloTopCandidates(
    searchJobId: string,
    companyDomain: string | null,
    people: ApolloPersonCandidate[]
  ): Promise<ApolloPersonCandidate[]> {
    if (!this.apolloEnrichTopN || people.length === 0) {
      return people;
    }

    const output: ApolloPersonCandidate[] = [];

    for (let index = 0; index < people.length; index += 1) {
      const person = people[index];
      if (index < this.apolloEnrichTopN) {
        await this.respectRateLimit('APOLLO_RATE_LIMIT_PER_MINUTE', 30);
        output.push(await this.enrichApolloPersonWithCache(searchJobId, companyDomain, person));
      } else {
        output.push(person);
      }
    }

    return output;
  }

  private async enrichApolloPersonWithCache(
    searchJobId: string,
    companyDomain: string | null,
    person: ApolloPersonCandidate
  ): Promise<ApolloPersonCandidate> {
    const requestHash = this.hashPayload({
      companyDomain: companyDomain ?? null,
      fullName: person.fullName,
      linkedinUrl: person.linkedinUrl,
      email: person.email
    });

    const cachedRows = await this.pg.query<RawSnapshotRow>(
      `SELECT raw_json
       FROM raw_data_snapshots
       WHERE source = 'apollo'
         AND entity_type = 'person-enrichment'
         AND content_hash = $1
         AND created_at >= now() - ($2::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestHash, this.apolloCacheHours]
    );

    if (cachedRows[0]) {
      const cached = cachedRows[0].raw_json as Record<string, unknown>;
      const item = cached?.item as ApolloPersonCandidate | undefined;
      if (item) {
        return item;
      }
    }

    const started = Date.now();
    const enriched = await this.apollo.enrichPerson(person, companyDomain ?? undefined);
    const latencyMs = Date.now() - started;

    await this.pg.query(
      `INSERT INTO external_api_requests (
         provider, endpoint, request_hash, status_code, latency_ms, search_job_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, endpoint, request_hash)
       DO UPDATE SET
         status_code = EXCLUDED.status_code,
         latency_ms = EXCLUDED.latency_ms,
         search_job_id = EXCLUDED.search_job_id,
         created_at = now()`,
      ['apollo', '/people/match', requestHash, 200, latencyMs, searchJobId]
    );

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'apollo',
        'person-enrichment',
        `${companyDomain ?? 'unknown-domain'}:${person.fullName}`,
        JSON.stringify({ item: enriched }),
        requestHash
      ]
    );

    return enriched;
  }

  private applyCompanyProfile(
    candidate: LinkedinCompanyCandidate,
    profile: LinkedinCompanyProfile
  ): LinkedinCompanyCandidate {
    return {
      name: profile.name || candidate.name,
      domain: profile.domain ?? candidate.domain,
      linkedinUrl: profile.linkedinUrl ?? candidate.linkedinUrl,
      industry: profile.industry ?? candidate.industry,
      region: profile.region ?? candidate.region,
      employeeEstimate: profile.employeeEstimate ?? candidate.employeeEstimate,
      raw: {
        candidate: candidate.raw,
        profile: profile.raw,
        summary: profile.summary
      }
    };
  }

  private applyCrawledData(
    candidate: LinkedinCompanyCandidate,
    crawlData: CrawledCompanyData | null
  ): LinkedinCompanyCandidate {
    if (!crawlData) {
      return candidate;
    }

    return {
      ...candidate,
      domain: crawlData.canonicalDomain ?? candidate.domain,
      linkedinUrl: candidate.linkedinUrl ?? crawlData.linkedinUrls[0] ?? null,
      raw: {
        ...candidate.raw,
        crawl: {
          title: crawlData.title,
          description: crawlData.description,
          aboutSummary: crawlData.aboutSummary,
          emails: crawlData.emails,
          phones: crawlData.phones,
          websiteUrl: crawlData.websiteUrl,
          pages: crawlData.pages
        }
      }
    };
  }

  private applyApolloCompanyData(
    candidate: LinkedinCompanyCandidate,
    apolloCompany: ApolloCompanyCandidate | null
  ): LinkedinCompanyCandidate {
    if (!apolloCompany) {
      return candidate;
    }

    return {
      name: apolloCompany.name || candidate.name,
      domain: apolloCompany.domain ?? candidate.domain,
      linkedinUrl: apolloCompany.linkedinUrl ?? candidate.linkedinUrl,
      industry: apolloCompany.industry ?? candidate.industry,
      region: candidate.region,
      employeeEstimate: apolloCompany.employeeEstimate ?? candidate.employeeEstimate,
      raw: {
        ...candidate.raw,
        apolloCompany: apolloCompany.raw,
        apolloSummary: apolloCompany.summary
      }
    };
  }

  private deduplicateCompanies(companies: LinkedinCompanyCandidate[]): LinkedinCompanyCandidate[] {
    const deduped: LinkedinCompanyCandidate[] = [];
    const seen = new Set<string>();

    for (const company of companies) {
      const key = company.domain
        ? `domain:${company.domain.toLowerCase()}`
        : company.linkedinUrl
          ? `linkedin:${company.linkedinUrl.toLowerCase()}`
          : `name:${company.name.toLowerCase().replace(/\s+/g, ' ')}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(company);
    }

    return deduped;
  }

  private async upsertCompany(searchJobId: string, candidate: LinkedinCompanyCandidate): Promise<CompanyRow> {
    const existing = await this.findExistingCompany(candidate);

    if (existing) {
      const rows = await this.pg.query<CompanyRow>(
        `UPDATE companies
         SET search_job_id = $2,
             name = COALESCE($3, name),
             domain = COALESCE($4, domain),
             linkedin_url = COALESCE($5, linkedin_url),
             industry = COALESCE($6, industry),
             region = COALESCE($7, region),
             employee_estimate = COALESCE($8, employee_estimate),
             source = 'rapidapi-linkedin+apollo+crawler',
             confidence_score = $9,
             updated_at = now()
         WHERE id = $1
         RETURNING id, name, domain`,
        [
          existing.id,
          searchJobId,
          candidate.name?.slice(0, 255) ?? null,
          candidate.domain?.slice(0, 255) ?? null,
          candidate.linkedinUrl?.slice(0, 1024) ?? null,
          candidate.industry?.slice(0, 255) ?? null,
          candidate.region?.slice(0, 120) ?? null,
          candidate.employeeEstimate,
          0.86
        ]
      );

      return rows[0];
    }

    const rows = await this.pg.query<CompanyRow>(
      `INSERT INTO companies (
         search_job_id, name, domain, linkedin_url, industry, employee_estimate,
         source, confidence_score, region
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         'rapidapi-linkedin+apollo+crawler', $7, $8
       )
       RETURNING id, name, domain`,
      [
        searchJobId,
        candidate.name.slice(0, 255),
        candidate.domain?.slice(0, 255) ?? null,
        candidate.linkedinUrl?.slice(0, 1024) ?? null,
        candidate.industry?.slice(0, 255) ?? null,
        candidate.employeeEstimate,
        0.86,
        candidate.region?.slice(0, 120) ?? null
      ]
    );

    return rows[0];
  }

  private async findExistingCompany(candidate: LinkedinCompanyCandidate): Promise<CompanyRow | null> {
    if (candidate.domain) {
      const rows = await this.pg.query<CompanyRow>(
        `SELECT id, name, domain
         FROM companies
         WHERE lower(domain) = lower($1)
         LIMIT 1`,
        [candidate.domain]
      );
      if (rows[0]) {
        return rows[0];
      }
    }

    if (candidate.linkedinUrl) {
      const rows = await this.pg.query<CompanyRow>(
        `SELECT id, name, domain
         FROM companies
         WHERE lower(linkedin_url) = lower($1)
         LIMIT 1`,
        [candidate.linkedinUrl]
      );
      if (rows[0]) {
        return rows[0];
      }
    }

    const rows = await this.pg.query<CompanyRow>(
      `SELECT id, name, domain
       FROM companies
       WHERE lower(name) = lower($1)
       LIMIT 1`,
      [candidate.name]
    );

    return rows[0] ?? null;
  }

  private async findContactsWithCache(
    searchJobId: string,
    domain: string
  ): Promise<HunterContactCandidate[]> {
    const normalizedDomain = this.normalizeDomain(domain);
    if (!normalizedDomain) {
      return [];
    }

    const requestHash = this.hashPayload({ domain: normalizedDomain });
    const cachedRows = await this.pg.query<RawSnapshotRow>(
      `SELECT raw_json
       FROM raw_data_snapshots
       WHERE source = 'hunter-contacts'
         AND entity_type = 'domain-search'
         AND content_hash = $1
         AND created_at >= now() - ($2::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestHash, this.hunterCacheHours]
    );

    if (cachedRows[0]) {
      const cached = cachedRows[0].raw_json as Record<string, unknown>;
      const items = Array.isArray(cached?.items) ? (cached.items as HunterContactCandidate[]) : [];
      return items;
    }

    const started = Date.now();
    const result = await this.hunter.searchContactsByDomain(normalizedDomain);
    const latencyMs = Date.now() - started;

    await this.pg.query(
      `INSERT INTO external_api_requests (
         provider, endpoint, request_hash, status_code, latency_ms, search_job_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, endpoint, request_hash)
       DO UPDATE SET
         status_code = EXCLUDED.status_code,
         latency_ms = EXCLUDED.latency_ms,
         search_job_id = EXCLUDED.search_job_id,
         created_at = now()`,
      ['hunter', '/v2/domain-search', requestHash, 200, latencyMs, searchJobId]
    );

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'hunter-contacts',
        'domain-search',
        normalizedDomain,
        JSON.stringify({ domain: normalizedDomain, items: result.items, raw: result.raw }),
        requestHash
      ]
    );

    return result.items;
  }

  private toUnifiedFromHunter(contact: HunterContactCandidate): UnifiedKeyPersonCandidate {
    return {
      fullName: contact.fullName,
      position: contact.position,
      email: contact.email,
      phone: contact.phone,
      linkedinUrl: contact.linkedinUrl,
      confidence: contact.confidence,
      source: 'hunter',
      seniority: null,
      location: null,
      raw: contact.raw
    };
  }

  private toUnifiedFromApollo(person: ApolloPersonCandidate): UnifiedKeyPersonCandidate {
    return {
      fullName: person.fullName,
      position: person.position,
      email: person.email,
      phone: person.phone,
      linkedinUrl: person.linkedinUrl,
      confidence: person.confidence,
      source: 'apollo',
      seniority: person.seniority,
      location: person.location,
      raw: person.raw
    };
  }

  private composeKeyPersonsWithoutMerge(
    hunterContacts: UnifiedKeyPersonCandidate[],
    apolloContacts: UnifiedKeyPersonCandidate[]
  ): UnifiedKeyPersonCandidate[] {
    // Keep each source record as-is. AI cleaning will normalize later.
    return [...hunterContacts, ...apolloContacts];
  }

  private prioritizeKeyPersons(contacts: UnifiedKeyPersonCandidate[]): UnifiedKeyPersonCandidate[] {
    const deduped = this.deduplicateContacts(contacts);

    return deduped
      .map((contact) => {
        const seniorityScore = this.seniorityScore(contact.position, contact.seniority);
        const emailBonus = contact.email ? 0.2 : 0;
        const linkedInBonus = contact.linkedinUrl ? 0.06 : 0;
        const sourceBonus = contact.source === 'multi' ? 0.08 : 0;
        const score = Number(
          (seniorityScore * 0.5 + contact.confidence * 0.3 + emailBonus * 0.12 + linkedInBonus * 0.04 + sourceBonus * 0.04).toFixed(3)
        );
        return { contact, score };
      })
      .filter((item) => item.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.contact);
  }

  private deduplicateContacts(contacts: UnifiedKeyPersonCandidate[]): UnifiedKeyPersonCandidate[] {
    const result: UnifiedKeyPersonCandidate[] = [];
    const seen = new Set<string>();

    for (const contact of contacts) {
      const key = contact.email
        ? `email:${contact.email.toLowerCase()}`
        : contact.linkedinUrl
          ? `linkedin:${contact.linkedinUrl.toLowerCase()}`
          : `name:${contact.fullName.toLowerCase().replace(/\s+/g, ' ')}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(contact);
    }

    return result;
  }

  private seniorityScore(position: string | null, seniority?: string | null): number {
    const merged = `${position ?? ''} ${seniority ?? ''}`.toLowerCase();

    if (!merged.trim()) {
      return 0.3;
    }

    if (merged.includes('ceo') || merged.includes('founder') || merged.includes('chief') || merged.includes('c_suite')) {
      return 1;
    }
    if (merged.includes('cto') || merged.includes('vp') || merged.includes('director')) {
      return 0.85;
    }
    if (merged.includes('head') || merged.includes('manager')) {
      return 0.7;
    }
    return 0.45;
  }

  private tokenize(value: string): string[] {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
  }

  private async upsertContact(
    searchJobId: string,
    company: CompanyRow,
    contact: UnifiedKeyPersonCandidate
  ): Promise<string> {
    const existing = await this.findExistingContact(company.id, contact);
    const source = contact.source === 'multi' ? 'multi-source' : contact.source;

    if (existing) {
      await this.pg.query(
        `UPDATE contacts
         SET search_job_id = $2,
             title = COALESCE($3, title),
             phone = COALESCE($4, phone),
             source = $5,
             confidence = $6,
             email_status = CASE WHEN $7::text IS NULL THEN email_status ELSE 'valid' END,
             updated_at = now()
         WHERE id = $1`,
        [existing, searchJobId, contact.position, contact.phone, source, contact.confidence, contact.email]
      );
      return existing;
    }

    const rows = await this.pg.query<{ id: string }>(
      `INSERT INTO contacts (
         company_id, search_job_id, full_name, title, role_category,
         linkedin_url, email, phone, source, confidence, email_status
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11
       )
       RETURNING id`,
      [
        company.id,
        searchJobId,
        contact.fullName.slice(0, 255),
        contact.position?.slice(0, 255) ?? null,
        this.inferRoleCategory(contact.position),
        contact.linkedinUrl?.slice(0, 1024) ?? null,
        contact.email?.slice(0, 255) ?? null,
        contact.phone?.slice(0, 50) ?? null,
        source,
        contact.confidence,
        contact.email ? 'valid' : 'unknown'
      ]
    );

    return rows[0].id;
  }

  private async saveKeyPersonSnapshot(
    searchJobId: string,
    contactId: string,
    companyId: string,
    keyPerson: UnifiedKeyPersonCandidate
  ): Promise<void> {
    const hash = this.hashPayload({ companyId, keyPerson });

    await this.pg.query(
      `INSERT INTO raw_data_snapshots (job_id, source, entity_type, entity_id, raw_json, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        searchJobId,
        'key-person-unified',
        'key-person',
        contactId,
        JSON.stringify({ companyId, keyPerson }),
        hash
      ]
    );
  }

  private async findExistingContact(
    companyId: string,
    contact: UnifiedKeyPersonCandidate
  ): Promise<string | null> {
    if (contact.email) {
      const rows = await this.pg.query<{ id: string }>(
        `SELECT id
         FROM contacts
         WHERE company_id = $1 AND lower(email) = lower($2)
         LIMIT 1`,
        [companyId, contact.email]
      );
      if (rows[0]) {
        return rows[0].id;
      }
    }

    if (contact.linkedinUrl) {
      const rows = await this.pg.query<{ id: string }>(
        `SELECT id
         FROM contacts
         WHERE company_id = $1 AND lower(linkedin_url) = lower($2)
         LIMIT 1`,
        [companyId, contact.linkedinUrl]
      );
      if (rows[0]) {
        return rows[0].id;
      }
    }

    const rows = await this.pg.query<{ id: string }>(
      `SELECT id
       FROM contacts
       WHERE company_id = $1 AND lower(full_name) = lower($2)
       LIMIT 1`,
      [companyId, contact.fullName]
    );

    return rows[0]?.id ?? null;
  }

  private async createProspectIfNeeded(
    searchJobId: string,
    company: CompanyRow,
    contactId: string,
    contact: UnifiedKeyPersonCandidate
  ): Promise<string | null> {
    const existing = contact.email
      ? await this.pg.query<{ id: string }>(
          `SELECT id
           FROM prospects
           WHERE search_job_id = $1
             AND lower(company) = lower($2)
             AND lower(person_name) = lower($3)
             AND lower(COALESCE(email, '')) = lower($4)
           LIMIT 1`,
          [searchJobId, company.name, contact.fullName, contact.email]
        )
      : await this.pg.query<{ id: string }>(
          `SELECT id
           FROM prospects
           WHERE search_job_id = $1
             AND lower(company) = lower($2)
             AND lower(person_name) = lower($3)
           LIMIT 1`,
          [searchJobId, company.name, contact.fullName]
        );

    if (existing[0]) {
      return null;
    }

    const rows = await this.pg.query<{ id: string }>(
      `INSERT INTO prospects (
         search_job_id, company_id, contact_id, company, domain, person_name, position,
         email, phone, industry, source, confidence, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, 'company->key-person', $11, 'new'
       )
       RETURNING id`,
      [
        searchJobId,
        company.id,
        contactId,
        company.name,
        company.domain,
        contact.fullName,
        contact.position,
        contact.email,
        contact.phone,
        null,
        Number(contact.confidence.toFixed(2))
      ]
    );

    await this.writeAudit(randomUUID(), 'prospect.created', 'prospect', rows[0].id, {
      searchJobId,
      companyId: company.id,
      contactId,
      source: contact.source
    });

    return rows[0].id;
  }

  private inferRoleCategory(position: string | null): string {
    if (!position) {
      return 'unknown';
    }

    const normalized = position.toLowerCase();
    if (normalized.includes('ceo') || normalized.includes('founder') || normalized.includes('chief')) {
      return 'executive';
    }
    if (normalized.includes('cto') || normalized.includes('engineering')) {
      return 'technology';
    }
    if (normalized.includes('head') || normalized.includes('manager')) {
      return 'management';
    }
    if (normalized.includes('sales') || normalized.includes('growth')) {
      return 'sales';
    }

    return 'general';
  }

  private async enqueueSheetSync(prospectId: string): Promise<void> {
    await this.syncQueue.add(
      'sync-prospect-row',
      { prospectId },
      {
        jobId: `sync:${prospectId}:${Date.now()}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000
        },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    );
  }

  private async writeAudit(
    actor: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.pg.query(
      `INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actor, action, entityType, entityId, JSON.stringify(metadata)]
    );
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private normalizeDomain(domain: string | null | undefined): string | null {
    if (!domain) {
      return null;
    }

    const normalized = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim();

    if (!normalized || !normalized.includes('.')) {
      return null;
    }

    return normalized;
  }

  private async respectRateLimit(envName: string, fallbackPerMinute: number): Promise<void> {
    const perMinute = Math.max(1, Number(process.env[envName] ?? fallbackPerMinute));
    const waitMs = Math.ceil(60000 / perMinute);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}
