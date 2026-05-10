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
  h1: string | null;
  h2: string[];
  textPreview: string | null;
  emails: string[];
  phones: string[];
  linkedinUrls: string[];
  socialUrls: string[];
  keywords: string[];
}

export interface CrawledCompanyData {
  canonicalDomain: string | null;
  websiteUrl: string | null;
  title: string | null;
  description: string | null;
  aboutSummary: string | null;
  keywords: string[];
  emails: string[];
  phones: string[];
  linkedinUrls: string[];
  socialUrls: string[];
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
    const resolved = await this.resolveBaseUrl(params);
    const base = resolved.baseUrl;

    if (!base) {
      return this.emptyResult(params.companyName, params.domain ?? null, 'missing_domain_or_website');
    }

    if (!(await this.isSafeTarget(base))) {
      return this.emptyResult(params.companyName, this.extractDomain(base), 'unsafe_target_blocked');
    }

    const paths = ['/', '/about', '/about-us', '/company', '/contact', '/contact-us', '/team', '/leadership', '/careers', '/products', '/services'];
    const pages: CrawlPageResult[] = [];
    const queuedUrls = new Set<string>();

    for (const path of paths) {
      queuedUrls.add(`${base}${path === '/' ? '' : path}`);
    }

    const seeds = await this.crawlSeedPages(base, queuedUrls);
    pages.push(...seeds.pages);
    for (const url of seeds.candidateUrls) {
      if (queuedUrls.size >= 18) break;
      queuedUrls.add(url);
    }

    for (const pageUrl of queuedUrls) {
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
      keywords: this.unique(pages.flatMap((page) => page.keywords)).slice(0, 25),
      emails: this.unique(pages.flatMap((page) => page.emails)),
      phones: this.unique(pages.flatMap((page) => page.phones)),
      linkedinUrls: this.unique(pages.flatMap((page) => page.linkedinUrls)),
      socialUrls: this.unique(pages.flatMap((page) => page.socialUrls)),
      pages,
      raw: {
        provider: 'custom-crawler',
        companyName: params.companyName,
        targetResolution: resolved.strategy,
        crawledAt: new Date().toISOString()
      }
    };
  }

  private parsePage(url: string, status: number, html: string): CrawlPageResult {
    const compact = html.replace(/\s+/g, ' ');
    const title = this.readMeta(html, /<title[^>]*>([^<]{2,200})<\/title>/i);
    const description =
      this.readMeta(html, /<meta\s+name=["']description["']\s+content=["']([^"']{2,400})["'][^>]*>/i) ??
      this.readMeta(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']{2,400})["'][^>]*>/i) ??
      this.readMeta(html, /<meta\s+name=["']twitter:description["']\s+content=["']([^"']{2,400})["'][^>]*>/i);
    const h1 = this.readMeta(html, /<h1[^>]*>([^<]{2,220})<\/h1>/i);
    const h2 = this.readAllText(html, /<h2[^>]*>([^<]{2,220})<\/h2>/gi, 6);
    const keywordsMeta = this.readMeta(html, /<meta\s+name=["']keywords["']\s+content=["']([^"']{2,500})["'][^>]*>/i);
    const keywords = keywordsMeta
      ? keywordsMeta
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 1)
          .slice(0, 15)
      : [];

    const textOnly = compact
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const emails = this.unique([
      ...this.matchAll(compact, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi),
      ...this.matchAll(compact, /mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi).map((item) => item.replace(/^mailto:/i, ''))
    ]).slice(0, 15);
    const phones = this.unique(this.matchAll(compact, /\+?[0-9][0-9()\-\s]{7,20}[0-9]/g))
      .concat(
        this.matchAll(compact, /tel:\+?[0-9][0-9()\-\s]{6,20}[0-9]/gi).map((item) => item.replace(/^tel:/i, ''))
      )
      .map((item) => item.trim())
      .filter((item, index, arr) => arr.indexOf(item) === index)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8)
      .slice(0, 15);
    const linkedinUrls = this.unique(this.matchAll(compact, /https?:\/\/([\w.-]+\.)?linkedin\.com\/[^"'\s<)]+/gi)).slice(0, 10);
    const socialUrls = this.unique(
      this.matchAll(
        compact,
        /https?:\/\/(?:www\.)?(?:facebook\.com|x\.com|twitter\.com|youtube\.com|instagram\.com|tiktok\.com)\/[^"'\s<)]+/gi
      )
    ).slice(0, 15);
    const jsonLd = this.extractJsonLdContacts(html);

    return {
      url,
      status,
      title,
      description,
      h1,
      h2,
      textPreview: textOnly.slice(0, 420) || null,
      emails: this.unique([...emails, ...jsonLd.emails]).slice(0, 15),
      phones: this.unique([...phones, ...jsonLd.phones]).slice(0, 15),
      linkedinUrls: this.unique([...linkedinUrls, ...jsonLd.linkedinUrls]).slice(0, 12),
      socialUrls,
      keywords
    };
  }

  private readMeta(html: string, pattern: RegExp): string | null {
    const matched = html.match(pattern);
    if (!matched?.[1]) {
      return null;
    }

    return matched[1].replace(/\s+/g, ' ').trim();
  }

  private readAllText(html: string, pattern: RegExp, limit: number): string[] {
    const values: string[] = [];
    let matched: RegExpExecArray | null = pattern.exec(html);
    while (matched && values.length < limit) {
      const value = (matched[1] ?? '').replace(/\s+/g, ' ').trim();
      if (value.length > 1) {
        values.push(value);
      }
      matched = pattern.exec(html);
    }
    return this.unique(values);
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

  private async resolveBaseUrl(
    params: CrawlCompanyParams
  ): Promise<{ baseUrl: string | null; strategy: 'website' | 'domain' | 'search' | 'none' }> {
    const fromDirect = this.buildBaseUrl(params.domain, params.websiteUrl);
    if (fromDirect) {
      if (this.normalizeUrl(params.websiteUrl)) {
        return { baseUrl: fromDirect, strategy: 'website' };
      }
      return { baseUrl: fromDirect, strategy: 'domain' };
    }

    const fromSearch = await this.discoverWebsiteByCompanyName(params.companyName);
    if (fromSearch) {
      return { baseUrl: fromSearch, strategy: 'search' };
    }

    const fromDirectory = await this.discoverByCompanyDirectory(params.companyName);
    if (fromDirectory) {
      return { baseUrl: fromDirectory, strategy: 'search' };
    }

    const fromHeuristic = await this.guessWebsiteByCompanyName(params.companyName);
    if (fromHeuristic) {
      return { baseUrl: fromHeuristic, strategy: 'search' };
    }

    return { baseUrl: null, strategy: 'none' };
  }

  private async discoverWebsiteByCompanyName(companyName: string): Promise<string | null> {
    const query = companyName.trim();
    if (!query || query.length < 2) {
      return null;
    }

    try {
      const response = await this.client.get<string>('https://html.duckduckgo.com/html/', {
        params: { q: `${query} official website` },
        responseType: 'text'
      });

      const html = typeof response.data === 'string' ? response.data : '';
      const candidates = this.extractSearchResultLinks(html);
      for (const url of candidates) {
        const normalized = this.normalizeUrl(url);
        if (!normalized) {
          continue;
        }

        const host = this.extractDomain(normalized);
        if (!host || this.isIgnoredSearchHost(host)) {
          continue;
        }

        return normalized;
      }
    } catch {
      return null;
    }

    return null;
  }

  private extractSearchResultLinks(html: string): string[] {
    const links: string[] = [];
    const regex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi;
    let matched: RegExpExecArray | null = regex.exec(html);
    while (matched) {
      const href = matched[1];
      const resolved = this.decodeDuckDuckGoRedirect(href);
      if (resolved) {
        links.push(resolved);
      }
      matched = regex.exec(html);
    }
    return this.unique(links);
  }

  private async crawlSeedPages(
    base: string,
    queuedUrls: Set<string>
  ): Promise<{ pages: CrawlPageResult[]; candidateUrls: string[] }> {
    const pages: CrawlPageResult[] = [];
    const candidateUrls: string[] = [];
    try {
      const response = await this.client.get<string>(`${base}`, { responseType: 'text' });
      const html = typeof response.data === 'string' ? response.data : '';
      pages.push(this.parsePage(base, response.status, html));
      const links = this.extractInternalLinks(base, html);
      for (const link of links) {
        if (!queuedUrls.has(link)) {
          candidateUrls.push(link);
        }
      }
    } catch {
      return { pages: [], candidateUrls: [] };
    }
    return { pages, candidateUrls };
  }

  private extractInternalLinks(base: string, html: string): string[] {
    const origin = new URL(base).origin;
    const links: string[] = [];
    const regex = /<a[^>]+href=["']([^"']+)["']/gi;
    let matched: RegExpExecArray | null = regex.exec(html);
    while (matched) {
      const href = (matched[1] ?? '').trim();
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        matched = regex.exec(html);
        continue;
      }
      try {
        const url = new URL(href, origin);
        if (url.origin !== origin) {
          matched = regex.exec(html);
          continue;
        }
        const path = url.pathname.toLowerCase();
        if (!/^\/[a-z0-9\-/_]{0,120}$/.test(path)) {
          matched = regex.exec(html);
          continue;
        }
        if (
          path.includes('about') ||
          path.includes('contact') ||
          path.includes('team') ||
          path.includes('company') ||
          path.includes('leadership') ||
          path.includes('products') ||
          path.includes('services') ||
          path.includes('customers')
        ) {
          links.push(`${url.origin}${url.pathname}`);
        }
      } catch {
        // ignore invalid URL
      }
      matched = regex.exec(html);
    }
    return this.unique(links).slice(0, 12);
  }

  private extractJsonLdContacts(html: string): { emails: string[]; phones: string[]; linkedinUrls: string[] } {
    const emails: string[] = [];
    const phones: string[] = [];
    const linkedinUrls: string[] = [];
    const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let matched: RegExpExecArray | null = regex.exec(html);
    while (matched) {
      const text = (matched[1] ?? '').trim();
      if (!text) {
        matched = regex.exec(html);
        continue;
      }
      try {
        const parsed = JSON.parse(text) as unknown;
        const compact = JSON.stringify(parsed);
        emails.push(...this.matchAll(compact, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi));
        phones.push(...this.matchAll(compact, /\+?[0-9][0-9()\-\s]{7,20}[0-9]/g));
        linkedinUrls.push(...this.matchAll(compact, /https?:\/\/([\w.-]+\.)?linkedin\.com\/[^"'\s<)]+/gi));
      } catch {
        // ignore bad json-ld
      }
      matched = regex.exec(html);
    }
    return {
      emails: this.unique(emails),
      phones: this.unique(phones),
      linkedinUrls: this.unique(linkedinUrls)
    };
  }

  private decodeDuckDuckGoRedirect(url: string): string | null {
    if (!url) {
      return null;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    try {
      const parsed = new URL(url, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) {
        return decodeURIComponent(uddg);
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private isIgnoredSearchHost(host: string): boolean {
    const blocked = [
      'linkedin.com',
      'facebook.com',
      'x.com',
      'twitter.com',
      'instagram.com',
      'youtube.com',
      'wikipedia.org',
      'crunchbase.com'
    ];
    return blocked.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  private async guessWebsiteByCompanyName(companyName: string): Promise<string | null> {
    const token = companyName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .join('');

    if (!token || token.length < 2) {
      return null;
    }

    const tlds = ['com', 'io', 'ai', 'co', 'net', 'org', 'vn'];
    for (const tld of tlds) {
      const host = `${token}.${tld}`;
      const url = `https://${host}`;
      try {
        if (!(await this.isSafeTarget(url))) {
          continue;
        }

        const response = await this.client.get<string>(url, { responseType: 'text' });
        if (response.status >= 200 && response.status < 400) {
          return url;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async discoverByCompanyDirectory(companyName: string): Promise<string | null> {
    const query = companyName.trim();
    if (!query || query.length < 2) {
      return null;
    }

    try {
      const response = await this.client.get<Array<Record<string, unknown>>>(
        'https://autocomplete.clearbit.com/v1/companies/suggest',
        {
          params: { query }
        }
      );

      const items = Array.isArray(response.data) ? response.data : [];
      for (const item of items) {
        const domain = typeof item.domain === 'string' ? item.domain.trim() : '';
        if (!domain || !domain.includes('.')) {
          continue;
        }

        const normalized = this.normalizeUrl(`https://${domain}`);
        if (!normalized) {
          continue;
        }

        const host = this.extractDomain(normalized);
        if (!host || this.isIgnoredSearchHost(host)) {
          continue;
        }

        return normalized;
      }
    } catch {
      return null;
    }

    return null;
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
      keywords: [],
      emails: [],
      phones: [],
      linkedinUrls: [],
      socialUrls: [],
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
