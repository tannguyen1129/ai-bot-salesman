import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

interface ApolloSearchCompanyParams {
  companyName: string;
  domain?: string | null;
}

interface ApolloSearchPeopleParams {
  companyName: string;
  domain?: string | null;
  limit?: number;
}

export interface ApolloCompanyCandidate {
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  employeeEstimate: number | null;
  summary: string | null;
  raw: Record<string, unknown>;
}

export interface ApolloPersonCandidate {
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  confidence: number;
  seniority: string | null;
  location: string | null;
  raw: Record<string, unknown>;
}

@Injectable()
export class ApolloClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.APOLLO_BASE_URL ?? 'https://api.apollo.io/api/v1',
      timeout: Number(process.env.APOLLO_TIMEOUT_MS ?? 30000)
    });
  }

  async searchCompany(params: ApolloSearchCompanyParams): Promise<{ item: ApolloCompanyCandidate | null; raw: unknown }> {
    if (!process.env.APOLLO_API_KEY) {
      return {
        item: null,
        raw: {
          skipped: true,
          reason: 'APOLLO_API_KEY is missing',
          params
        }
      };
    }

    try {
      const response = await this.client.post('/mixed_companies/search', {
        q_organization_name: params.companyName,
        q_organization_domains_list: params.domain ? [params.domain] : undefined,
        page: 1,
        per_page: 10
      }, {
        headers: {
          'x-api-key': process.env.APOLLO_API_KEY
        }
      });

      const payload = response.data as Record<string, unknown>;
      const list = this.readArray(payload, ['organizations', 'accounts', 'companies', 'data']);
      const best = this.pickBestCompany(list, params);

      return {
        item: best,
        raw: response.data
      };
    } catch (error) {
      return {
        item: null,
        raw: {
          failed: true,
          reason: error instanceof Error ? error.message : 'apollo company search failed'
        }
      };
    }
  }

  async searchPeople(params: ApolloSearchPeopleParams): Promise<{ items: ApolloPersonCandidate[]; raw: unknown }> {
    if (!process.env.APOLLO_API_KEY) {
      return {
        items: [],
        raw: {
          skipped: true,
          reason: 'APOLLO_API_KEY is missing',
          params
        }
      };
    }

    try {
      const requestBody = {
        q_keywords: params.companyName,
        q_organization_domains_list: params.domain ? [params.domain] : undefined,
        person_seniorities: ['c_suite', 'founder', 'vp', 'head', 'director'],
        page: 1,
        per_page: Math.max(5, Math.min(25, params.limit ?? 5))
      };

      let response;
      try {
        response = await this.client.post('/mixed_people/search', requestBody, {
          headers: {
            'x-api-key': process.env.APOLLO_API_KEY
          }
        });
      } catch {
        response = await this.client.post('/mixed_people/api_search', requestBody, {
          headers: {
            'x-api-key': process.env.APOLLO_API_KEY
          }
        });
      }

      const payload = response.data as Record<string, unknown>;
      const people = this.readArray(payload, ['people', 'contacts', 'data']);

      const items = people
        .map((item) => this.normalizePerson(item))
        .filter((item): item is ApolloPersonCandidate => item !== null);

      return {
        items,
        raw: response.data
      };
    } catch (error) {
      return {
        items: [],
        raw: {
          failed: true,
          reason: error instanceof Error ? error.message : 'apollo people search failed'
        }
      };
    }
  }

  async enrichOrganization(
    companyName: string,
    companyDomain?: string | null
  ): Promise<{ item: ApolloCompanyCandidate | null; raw: unknown }> {
    if (!process.env.APOLLO_API_KEY) {
      return {
        item: null,
        raw: {
          skipped: true,
          reason: 'APOLLO_API_KEY is missing',
          companyName,
          companyDomain
        }
      };
    }

    try {
      const response = await this.client.get('/organizations/enrich', {
        params: {
          domain: companyDomain ?? undefined,
          organization_name: companyName || undefined
        },
        headers: {
          'x-api-key': process.env.APOLLO_API_KEY
        }
      });

      const payload = response.data as Record<string, unknown>;
      const organization = (payload.organization as Record<string, unknown> | undefined) ?? payload;
      return {
        item: this.normalizeCompany(organization),
        raw: response.data
      };
    } catch (error) {
      return {
        item: null,
        raw: {
          failed: true,
          reason: error instanceof Error ? error.message : 'apollo organization enrich failed'
        }
      };
    }
  }

  async enrichPerson(person: ApolloPersonCandidate, companyDomain?: string | null): Promise<ApolloPersonCandidate> {
    if (!process.env.APOLLO_API_KEY) {
      return person;
    }

    try {
      const response = await this.client.post('/people/match', {
        name: person.fullName,
        domain: companyDomain ?? undefined,
        organization_name: undefined,
        linkedin_url: person.linkedinUrl ?? undefined,
        reveal_personal_emails: false,
        reveal_phone_number: false
      }, {
        headers: {
          'x-api-key': process.env.APOLLO_API_KEY
        }
      });

      const payload = response.data as Record<string, unknown>;
      const data = (payload.person as Record<string, unknown>) ?? (payload.data as Record<string, unknown>) ?? payload;

      const enriched = this.normalizePerson(data);
      if (!enriched) {
        return person;
      }

      return {
        ...person,
        fullName: enriched.fullName || person.fullName,
        position: enriched.position ?? person.position,
        email: enriched.email ?? person.email,
        phone: enriched.phone ?? person.phone,
        linkedinUrl: enriched.linkedinUrl ?? person.linkedinUrl,
        confidence: Math.max(person.confidence, enriched.confidence),
        seniority: enriched.seniority ?? person.seniority,
        location: enriched.location ?? person.location,
        raw: {
          search: person.raw,
          enriched: data
        }
      };
    } catch {
      return person;
    }
  }

  private pickBestCompany(items: unknown[], params: ApolloSearchCompanyParams): ApolloCompanyCandidate | null {
    const normalized = items
      .map((item) => this.normalizeCompany(item))
      .filter((item): item is ApolloCompanyCandidate => item !== null);

    if (!normalized.length) {
      return null;
    }

    const domain = params.domain?.toLowerCase();
    if (domain) {
      const exact = normalized.find((item) => item.domain?.toLowerCase() === domain);
      if (exact) {
        return exact;
      }
    }

    const nameTokens = this.tokenize(params.companyName);
    return normalized
      .map((item) => {
        const tokens = this.tokenize(item.name);
        const matches = nameTokens.filter((token) => tokens.includes(token)).length;
        const score = nameTokens.length === 0 ? 0 : matches / nameTokens.length;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item)[0] ?? null;
  }

  private normalizeCompany(item: unknown): ApolloCompanyCandidate | null {
    const source = item as Record<string, unknown>;
    const name = this.pickFirstString(source, ['name', 'organization_name', 'company_name']);
    if (!name) {
      return null;
    }

    const domainCandidate = this.pickFirstString(source, ['primary_domain', 'domain', 'website_url']);

    return {
      name,
      domain: this.normalizeDomain(domainCandidate),
      linkedinUrl: this.pickFirstString(source, ['linkedin_url']),
      industry: this.pickFirstString(source, ['industry']),
      employeeEstimate: this.pickFirstNumber(source, ['estimated_num_employees', 'employee_count']),
      summary: this.pickFirstString(source, ['short_description', 'description']),
      raw: source
    };
  }

  private normalizePerson(item: unknown): ApolloPersonCandidate | null {
    const source = item as Record<string, unknown>;
    const fullName =
      this.pickFirstString(source, ['name']) ??
      [
        this.pickFirstString(source, ['first_name']),
        this.pickFirstString(source, ['last_name'])
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

    if (!fullName) {
      return null;
    }

    const organization = (source.organization as Record<string, unknown> | undefined) ?? {};
    const organizationUrl = this.pickFirstString(organization, ['website_url', 'domain']);

    return {
      fullName,
      position: this.pickFirstString(source, ['title', 'headline']),
      email: this.pickFirstString(source, ['email']),
      phone: this.pickFirstString(source, ['phone', 'phone_number']),
      linkedinUrl: this.pickFirstString(source, ['linkedin_url']),
      confidence: this.confidenceBySignals(source),
      seniority: this.pickFirstString(source, ['seniority']),
      location: this.pickFirstString(source, ['city', 'state', 'country']),
      raw: {
        ...source,
        organization_url: organizationUrl
      }
    };
  }

  private confidenceBySignals(source: Record<string, unknown>): number {
    let score = 0.55;
    if (this.pickFirstString(source, ['email'])) {
      score += 0.2;
    }
    if (this.pickFirstString(source, ['phone', 'phone_number'])) {
      score += 0.1;
    }
    if (this.pickFirstString(source, ['linkedin_url'])) {
      score += 0.1;
    }

    const seniority = this.pickFirstString(source, ['seniority'])?.toLowerCase();
    if (seniority && ['c_suite', 'founder', 'vp', 'head', 'director'].includes(seniority)) {
      score += 0.05;
    }

    return Number(Math.min(0.98, score).toFixed(2));
  }

  private readArray(payload: Record<string, unknown>, keys: string[]): unknown[] {
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value;
      }
      if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).items)) {
        return (value as { items: unknown[] }).items;
      }
    }
    return [];
  }

  private pickFirstString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
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
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replaceAll(',', '').trim());
        if (Number.isFinite(parsed)) {
          return Math.trunc(parsed);
        }
      }
    }
    return null;
  }

  private tokenize(value: string): string[] {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1);
  }

  private normalizeDomain(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim();

    return normalized.includes('.') ? normalized : null;
  }
}
