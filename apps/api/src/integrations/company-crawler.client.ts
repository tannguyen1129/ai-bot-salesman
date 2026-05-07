import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { lookup } from 'dns/promises';

interface CrawlCompanyParams {
  companyName: string;
  domain?: string | null;
  websiteUrl?: string | null;
}

interface CrawlPageResult {
  url: string;
  status: number;
  title: string | null;
  description: string | null;
  textPreview: string | null;
  emails: string[];
  phones: string[];
  linkedinUrls: string[];
}

export interface CrawledCompanyData {
  canonicalDomain: string | null;
  websiteUrl: string | null;
  title: string | null;
  description: string | null;
  aboutSummary: string | null;
  emails: string[];
  phones: string[];
  linkedinUrls: string[];
  pages: CrawlPageResult[];
  raw: Record<string, unknown>;
}

@Injectable()
export class CompanyCrawlerClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: Number(process.env.CRAWLER_TIMEOUT_MS ?? 10000),
      maxRedirects: 3,
      headers: {
        'User-Agent': process.env.CRAWLER_USER_AGENT ?? 'sale-man-crawler/1.0 (+https://example.local)'
      },
      validateStatus: (status) => status >= 200 && status < 400
    });
  }

  async crawlCompany(params: CrawlCompanyParams): Promise<CrawledCompanyData> {
    const base = this.buildBaseUrl(params.domain, params.websiteUrl);

    if (!base) {
      return this.emptyResult(params.companyName, params.domain ?? null, 'missing_domain');
    }

    if (!(await this.isSafeTarget(base))) {
      return this.emptyResult(params.companyName, this.extractDomain(base), 'unsafe_target_blocked');
    }

    const paths = ['/', '/about', '/about-us', '/company', '/contact', '/team'];
    const pages: CrawlPageResult[] = [];

    for (const path of paths) {
      const pageUrl = `${base}${path === '/' ? '' : path}`;
      try {
        const response = await this.client.get<string>(pageUrl, {
          responseType: 'text'
        });

        const html = typeof response.data === 'string' ? response.data : '';
        pages.push(this.parsePage(pageUrl, response.status, html));
      } catch {
        continue;
      }
    }

    if (!pages.length) {
      return this.emptyResult(params.companyName, this.extractDomain(base), 'crawl_failed');
    }

    const title = this.firstNonEmpty(pages.map((item) => item.title));
    const description = this.firstNonEmpty(pages.map((item) => item.description));
    const summary = this.firstNonEmpty(pages.map((item) => item.textPreview));

    return {
      canonicalDomain: this.extractDomain(base),
      websiteUrl: base,
      title,
      description,
      aboutSummary: summary,
      emails: this.unique(pages.flatMap((page) => page.emails)),
      phones: this.unique(pages.flatMap((page) => page.phones)),
      linkedinUrls: this.unique(pages.flatMap((page) => page.linkedinUrls)),
      pages,
      raw: {
        provider: 'custom-crawler',
        companyName: params.companyName,
        crawledAt: new Date().toISOString()
      }
    };
  }

  private parsePage(url: string, status: number, html: string): CrawlPageResult {
    const compact = html.replace(/\s+/g, ' ');
    const title = this.readMeta(html, /<title[^>]*>([^<]{2,200})<\/title>/i);
    const description =
      this.readMeta(html, /<meta\s+name=["']description["']\s+content=["']([^"']{2,400})["'][^>]*>/i) ??
      this.readMeta(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']{2,400})["'][^>]*>/i);

    const textOnly = compact
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const emails = this.unique(this.matchAll(compact, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)).slice(0, 10);
    const phones = this.unique(this.matchAll(compact, /\+?[0-9][0-9()\-\s]{7,20}[0-9]/g))
      .map((item) => item.trim())
      .filter((item) => item.length >= 8)
      .slice(0, 10);
    const linkedinUrls = this.unique(this.matchAll(compact, /https?:\/\/([\w.-]+\.)?linkedin\.com\/[^"'\s<)]+/gi)).slice(0, 10);

    return {
      url,
      status,
      title,
      description,
      textPreview: textOnly.slice(0, 420) || null,
      emails,
      phones,
      linkedinUrls
    };
  }

  private readMeta(html: string, pattern: RegExp): string | null {
    const matched = html.match(pattern);
    if (!matched?.[1]) {
      return null;
    }

    return matched[1].replace(/\s+/g, ' ').trim();
  }

  private buildBaseUrl(domain?: string | null, websiteUrl?: string | null): string | null {
    const fromWebsite = this.normalizeUrl(websiteUrl);
    if (fromWebsite) {
      return fromWebsite;
    }

    const cleanDomain = domain
      ?.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim();

    if (!cleanDomain || !cleanDomain.includes('.')) {
      return null;
    }

    return `https://${cleanDomain}`;
  }

  private normalizeUrl(input?: string | null): string | null {
    if (!input) {
      return null;
    }

    try {
      const raw = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`;
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return null;
      }

      const host = url.hostname.toLowerCase();
      if (!host || host === 'localhost') {
        return null;
      }

      return `${url.protocol}//${host}`;
    } catch {
      return null;
    }
  }

  private async isSafeTarget(baseUrl: string): Promise<boolean> {
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      if (!host) {
        return false;
      }

      if (host === 'localhost' || host.endsWith('.local')) {
        return false;
      }

      if (this.isPrivateIp(host)) {
        return false;
      }

      const resolved = await lookup(host);
      return !this.isPrivateIp(resolved.address);
    } catch {
      return false;
    }
  }

  private isPrivateIp(value: string): boolean {
    if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)) {
      return true;
    }

    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(value)) {
      return true;
    }

    if (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) {
      return true;
    }

    return false;
  }

  private extractDomain(baseUrl: string): string | null {
    try {
      return new URL(baseUrl).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  private firstNonEmpty(values: Array<string | null>): string | null {
    for (const value of values) {
      if (value && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private matchAll(input: string, pattern: RegExp): string[] {
    const results = input.match(pattern);
    if (!results) {
      return [];
    }

    return results.map((item) => item.trim()).filter(Boolean);
  }

  private unique(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(normalized);
    }

    return result;
  }

  private emptyResult(companyName: string, domain: string | null, reason: string): CrawledCompanyData {
    return {
      canonicalDomain: domain,
      websiteUrl: domain ? `https://${domain}` : null,
      title: null,
      description: null,
      aboutSummary: null,
      emails: [],
      phones: [],
      linkedinUrls: [],
      pages: [],
      raw: {
        provider: 'custom-crawler',
        companyName,
        reason,
        crawledAt: new Date().toISOString()
      }
    };
  }
}
