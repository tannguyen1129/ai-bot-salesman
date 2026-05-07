import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface HunterContactCandidate {
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  confidence: number;
  raw: Record<string, unknown>;
}

@Injectable()
export class HunterClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.HUNTER_BASE_URL ?? 'https://api.hunter.io',
      timeout: Number(process.env.HUNTER_TIMEOUT_MS ?? 20000)
    });
  }

  async searchContactsByDomain(domain: string): Promise<{ items: HunterContactCandidate[]; raw: unknown }> {
    if (!process.env.HUNTER_API_KEY) {
      return {
        items: [],
        raw: { skipped: true, reason: 'HUNTER_API_KEY is missing', domain }
      };
    }

    const response = await this.client.get('/v2/domain-search', {
      params: {
        domain,
        api_key: process.env.HUNTER_API_KEY,
        limit: Number(process.env.HUNTER_CONTACTS_LIMIT ?? 5)
      }
    });

    const payload = response.data as Record<string, unknown>;
    const data = (payload?.data ?? {}) as Record<string, unknown>;
    const emails = Array.isArray(data?.emails) ? data.emails : [];

    const contacts = emails
      .map((item) => this.normalizeContact(item))
      .filter((item): item is HunterContactCandidate => item !== null);

    return {
      items: contacts,
      raw: response.data
    };
  }

  private normalizeContact(item: unknown): HunterContactCandidate | null {
    const source = item as Record<string, unknown>;
    const firstName = this.pickString(source, ['first_name']);
    const lastName = this.pickString(source, ['last_name']);
    const fullName = this.pickString(source, ['full_name']) ?? [firstName, lastName].filter(Boolean).join(' ').trim();

    if (!fullName) {
      return null;
    }

    const confidenceRaw = source.confidence;
    const confidence =
      typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
        ? Number((Math.min(100, Math.max(0, confidenceRaw)) / 100).toFixed(2))
        : 0.7;

    return {
      fullName,
      position: this.pickString(source, ['position']),
      email: this.pickString(source, ['value']),
      phone: this.pickString(source, ['phone_number']),
      linkedinUrl: this.pickString(source, ['linkedin']),
      confidence,
      raw: source
    };
  }

  private pickString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

}
