import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

interface SearchPeopleParams {
  keywords: string;
  geo?: string;
  page?: number;
}

interface SearchCompaniesParams {
  keywords: string;
  region?: string;
  page?: number;
}

export interface LinkedinCompanyCandidate {
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  region: string | null;
  employeeEstimate: number | null;
  raw: Record<string, unknown>;
}

export interface LinkedinCompanyProfile {
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  region: string | null;
  employeeEstimate: number | null;
  summary: string | null;
  raw: Record<string, unknown>;
}

@Injectable()
export class RapidLinkedinClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.RAPIDAPI_LINKEDIN_BASE_URL ?? 'https://linkedin-api8.p.rapidapi.com',
      timeout: Number(process.env.RAPIDAPI_TIMEOUT_MS ?? 30000),
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
        'X-RapidAPI-Host': process.env.RAPIDAPI_LINKEDIN_HOST ?? 'linkedin-api8.p.rapidapi.com'
      }
    });
  }

  async searchPeople(params: SearchPeopleParams): Promise<{ items: unknown[]; raw: unknown }> {
    if (!process.env.RAPIDAPI_KEY) {
      return {
        items: [],
        raw: { skipped: true, reason: 'RAPIDAPI_KEY is missing', params }
      };
    }

    const response = await this.client.get('/search-people', {
      params: {
        keywords: params.keywords,
        geo: params.geo,
        page: params.page ?? 1
      }
    });

    const items = Array.isArray(response.data?.data) ? response.data.data : [];
    return {
      items,
      raw: response.data
    };
  }

  async searchCompanies(params: SearchCompaniesParams): Promise<{ items: LinkedinCompanyCandidate[]; raw: unknown }> {
    if (!process.env.RAPIDAPI_KEY) {
      return {
        items: [],
        raw: { skipped: true, reason: 'RAPIDAPI_KEY is missing', params }
      };
    }

    try {
      const response = await this.client.get('/search-companies', {
        params: {
          keywords: params.keywords,
          page: params.page ?? 1
        }
      });

      const payload = response.data as Record<string, unknown>;
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.companies)
            ? payload.companies
            : [];

      return {
        items: this.normalizeCompanyItems(list, params.region),
        raw: response.data
      };
    } catch (error) {
      const fallback = await this.searchPeople({
        keywords: params.keywords,
        geo: params.region,
        page: params.page
      });

      return {
        items: this.normalizeCompanyItems(fallback.items, params.region),
        raw: {
          fallback: '/search-people',
          reason: error instanceof Error ? error.message : 'search-companies failed',
          response: fallback.raw
        }
      };
    }
  }

  async getCompanyProfile(candidate: LinkedinCompanyCandidate): Promise<LinkedinCompanyProfile> {
    if (!process.env.RAPIDAPI_KEY) {
      return this.buildEmptyCompanyProfile(candidate, 'RAPIDAPI_KEY is missing');
    }

    const fallback = this.buildEmptyCompanyProfile(candidate, 'company-details request failed');

    try {
      const response = await this.client.get('/company-details', {
        params: {
          username: this.extractCompanySlug(candidate.linkedinUrl),
          company_url: candidate.linkedinUrl,
          domain: candidate.domain
        }
      });

      const payload = response.data as Record<string, unknown>;
      const data = (payload?.data ?? payload) as Record<string, unknown>;

      return {
        name:
          this.pickFirstString(data, ['companyName', 'name', 'organizationName']) ??
          candidate.name,
        domain:
          this.pickFirstString(data, ['website', 'domain', 'companyDomain']) ??
          candidate.domain,
        linkedinUrl:
          this.pickFirstString(data, ['linkedinUrl', 'url']) ??
          candidate.linkedinUrl,
        industry:
          this.pickFirstString(data, ['industry', 'companyIndustry']) ??
          candidate.industry,
        region:
          this.pickFirstString(data, ['headquarter', 'location', 'country']) ??
          candidate.region,
        employeeEstimate:
          this.pickFirstNumber(data, ['employeeCount', 'employees', 'companyEmployeeCount']) ??
          candidate.employeeEstimate,
        summary:
          this.pickFirstString(data, ['description', 'summary', 'tagline']) ?? null,
        raw: data
      };
    } catch {
      return fallback;
    }
  }

  private buildEmptyCompanyProfile(candidate: LinkedinCompanyCandidate, reason: string): LinkedinCompanyProfile {
    return {
      name: candidate.name,
      domain: candidate.domain,
      linkedinUrl: candidate.linkedinUrl,
      industry: candidate.industry,
      region: candidate.region,
      employeeEstimate: candidate.employeeEstimate,
      summary: null,
      raw: {
        skipped: true,
        reason,
        provider: 'rapidapi-linkedin',
        company: candidate
      }
    };
  }

  private extractCompanySlug(linkedinUrl: string | null): string | null {
    if (!linkedinUrl) {
      return null;
    }

    const match = linkedinUrl.match(/linkedin\.com\/company\/([^/?#]+)/i);
    if (!match?.[1]) {
      return null;
    }

    return match[1].trim();
  }

  private normalizeCompanyItems(items: unknown[], region?: string): LinkedinCompanyCandidate[] {
    const normalized: LinkedinCompanyCandidate[] = [];

    for (const item of items) {
      const source = item as Record<string, unknown>;
      const name = this.pickFirstString(source, [
        'companyName',
        'name',
        'organizationName',
        'currentCompanyName'
      ]);

      if (!name) {
        continue;
      }

      normalized.push({
        name,
        domain: this.pickFirstString(source, ['companyDomain', 'domain', 'website']),
        linkedinUrl: this.pickFirstString(source, ['companyLinkedinUrl', 'linkedinUrl', 'url']),
        industry: this.pickFirstString(source, ['companyIndustry', 'industry']),
        region: this.pickFirstString(source, ['region', 'country']) ?? region ?? null,
        employeeEstimate: this.pickFirstNumber(source, [
          'companyEmployeeCount',
          'employeeCount',
          'employees'
        ]),
        raw: source
      });
    }

    return normalized;
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
