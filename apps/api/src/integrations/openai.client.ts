import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface ProspectRawSnapshot {
  source: string;
  entityType: string;
  entityId: string | null;
  rawJson: unknown;
}

export interface ProspectSheetRecord {
  prospectId: string;
  searchJobId: string;
  companyName: string;
  companyDomain: string | null;
  companyIndustry: string | null;
  companyRegion: string | null;
  companyLinkedinUrl: string | null;
  personName: string;
  personTitle: string | null;
  personEmail: string | null;
  personPhone: string | null;
  personLinkedinUrl: string | null;
  prospectStatus: string;
  prospectSource: string;
  confidence: string | null;
}

export interface CleanedProspectForSheet {
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_region: string | null;
  company_summary: string | null;
  key_person_name: string;
  key_person_title: string | null;
  key_person_email: string | null;
  key_person_phone: string | null;
  key_person_linkedin: string | null;
  confidence_score: number | null;
  source_list: string[];
  notes: string | null;
}

export interface ProspectComposeInput {
  companyName: string;
  companyIndustry: string | null;
  personName: string;
  personTitle: string | null;
  personEmail: string | null;
}

export interface TemplateComposeInput {
  companyName: string;
  companyIndustry: string | null;
  personName: string;
  personTitle: string | null;
  personEmail: string | null;
  step: number;
}

export interface ProspectCompanyReportInput {
  modelKind?: 'balanced' | 'reasoning' | 'fast';
  promptTemplate: string;
  prospect: {
    prospectId: string;
    companyName: string;
    companyDomain: string | null;
    companyIndustry: string | null;
    companyRegion: string | null;
    personName: string;
    personTitle: string | null;
    personEmail: string | null;
    personPhone: string | null;
    source: string;
  };
  cleanedProfile?: {
    companySummary: string | null;
    keyPersonLinkedin: string | null;
    confidenceScore: number | null;
    sourceList: string[];
    notes: string | null;
  } | null;
  relatedKeyPersons?: Array<{
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    confidence: number | null;
    source: string;
  }>;
  snapshots: ProspectRawSnapshot[];
}

export interface ProspectCompanyReportResult {
  reportMarkdown: string;
  reportJson: Record<string, unknown>;
  provider: 'openai' | 'gemini' | 'fallback';
  confidenceScore: number | null;
}

@Injectable()
export class OpenAiClient {
  private readonly openAiClient: AxiosInstance;
  private readonly geminiClient: AxiosInstance;

  constructor() {
    this.openAiClient = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 90000),
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
        'Content-Type': 'application/json'
      }
    });

    this.geminiClient = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      timeout: Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? 90000),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  private getProvider(): 'openai' | 'gemini' {
    return process.env.AI_PROVIDER?.trim().toLowerCase() === 'gemini' ? 'gemini' : 'openai';
  }

  private getModel(kind: 'balanced' | 'reasoning' | 'fast' = 'balanced'): string {
    if (this.getProvider() === 'gemini') {
      if (kind === 'fast') return process.env.GEMINI_MODEL_FAST ?? 'gemini-2.5-flash';
      if (kind === 'reasoning') return process.env.GEMINI_MODEL_REASONING ?? process.env.GEMINI_MODEL_BALANCED ?? 'gemini-2.5-pro';
      return process.env.GEMINI_MODEL_BALANCED ?? 'gemini-2.5-flash';
    }

    if (kind === 'fast') return process.env.OPENAI_MODEL_FAST ?? 'gpt-5.4-mini';
    if (kind === 'reasoning') return process.env.OPENAI_MODEL_REASONING ?? process.env.OPENAI_MODEL_BALANCED ?? 'gpt-5.5';
    return process.env.OPENAI_MODEL_BALANCED ?? 'gpt-5.5';
  }

  private hasProviderKey(): boolean {
    if (this.getProvider() === 'gemini') {
      return Boolean(process.env.GEMINI_API_KEY?.trim());
    }
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  private async generateText(
    prompt: string,
    kind: 'balanced' | 'reasoning' | 'fast' = 'balanced'
  ): Promise<{ text: string | null; provider: 'openai' | 'gemini' | 'fallback' }> {
    if (!this.hasProviderKey()) {
      return { text: null, provider: 'fallback' };
    }

    const model = this.getModel(kind);

    try {
      if (this.getProvider() === 'gemini') {
        const response = await this.geminiClient.post(
          `/models/${model}:generateContent`,
          {
            contents: [{ parts: [{ text: prompt }] }]
          },
          {
            params: {
              key: process.env.GEMINI_API_KEY
            }
          }
        );

        const parts = response.data?.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts)
          ? parts
              .map((part: { text?: unknown }) => (typeof part?.text === 'string' ? part.text : ''))
              .join('')
              .trim()
          : '';
        return {
          text: text.length > 0 ? text : null,
          provider: 'gemini'
        };
      }

      const response = await this.openAiClient.post('/responses', {
        model,
        input: prompt
      });

      const text =
        typeof response.data?.output_text === 'string' && response.data.output_text.trim().length > 0
          ? response.data.output_text.trim()
          : null;

      return {
        text,
        provider: 'openai'
      };
    } catch {
      return { text: null, provider: 'fallback' };
    }
  }

  async healthCheckModel(): Promise<{ ok: boolean; model: string }> {
    const model = this.getModel('balanced');
    return { ok: true, model };
  }

  async generateLeadAnalysis(input: {
    candidateName: string;
    icpName: string;
    score: number;
    breakdown: Record<string, number>;
    industry: string | null;
    employeeEstimate: number | null;
    domain: string | null;
  }): Promise<string | null> {
    const prompt = [
      'Bạn là trợ lý sales B2B enterprise.',
      `Phân tích candidate: ${input.candidateName}`,
      `ICP: ${input.icpName}`,
      `Điểm hiện tại: ${input.score}/100`,
      `Breakdown: ${JSON.stringify(input.breakdown)}`,
      `Industry: ${input.industry ?? 'N/A'}, Employee: ${input.employeeEstimate ?? 'N/A'}, Domain: ${input.domain ?? 'N/A'}`,
      'Hãy viết 3-4 câu tiếng Việt: nhận định mức phù hợp, rủi ro dữ liệu, và gợi ý bước tiếp theo cho sales.'
    ].join('\n');

    const generated = await this.generateText(prompt, 'balanced');
    return generated.text;
  }

  async cleanProspectForSheet(input: {
    prospect: ProspectSheetRecord;
    snapshots: ProspectRawSnapshot[];
  }): Promise<CleanedProspectForSheet> {
    const fallback = this.fallbackCleanProspect(input.prospect, input.snapshots);

    if (!this.hasProviderKey()) {
      return fallback;
    }

    const prompt = [
      'Bạn là data quality assistant cho hệ thống sales B2B.',
      'Nhiệm vụ: làm sạch và chuẩn hóa thông tin prospect từ raw snapshots đa nguồn.',
      'Chỉ trả về 1 JSON object hợp lệ, không kèm markdown.',
      'Schema JSON bắt buộc:',
      JSON.stringify(
        {
          company_name: 'string',
          company_domain: 'string|null',
          company_industry: 'string|null',
          company_region: 'string|null',
          company_summary: 'string|null',
          key_person_name: 'string',
          key_person_title: 'string|null',
          key_person_email: 'string|null',
          key_person_phone: 'string|null',
          key_person_linkedin: 'string|null',
          confidence_score: 'number|null',
          source_list: ['string'],
          notes: 'string|null'
        },
        null,
        2
      ),
      `Prospect input: ${JSON.stringify(input.prospect)}`,
      `Raw snapshots: ${JSON.stringify(this.trimSnapshots(input.snapshots))}`,
      'Ưu tiên dữ liệu có độ đầy đủ cao; chuẩn hóa domain bỏ protocol/www; email lower-case; loại bỏ giá trị không chắc chắn.'
    ].join('\n');

    const generated = await this.generateText(prompt, 'balanced');
    if (!generated.text) {
      return fallback;
    }

    const parsed = this.safeParseCleanJson(generated.text);
    if (!parsed) {
      return fallback;
    }

    return this.normalizeCleanedOutput(parsed, fallback);
  }

  async composeDraftEmail(input: {
    prospect: ProspectComposeInput;
    promptTemplate: string;
  }): Promise<{ subject: string; bodyText: string; provider: 'openai' | 'gemini' | 'fallback' }> {
    const fallback = this.fallbackComposeDraft(input.prospect);

    if (!this.hasProviderKey()) {
      return {
        ...fallback,
        provider: 'fallback'
      };
    }

    const prompt = [
      input.promptTemplate,
      '',
      'Return strict JSON with keys: subject, body_text',
      `prospect: ${JSON.stringify(input.prospect)}`
    ].join('\n');

    const generated = await this.generateText(prompt, 'balanced');
    if (!generated.text) {
      return {
        ...fallback,
        provider: 'fallback'
      };
    }

    const parsed = this.safeParseCleanJson(generated.text);
    if (!parsed) {
      return { ...fallback, provider: 'fallback' };
    }

    const subject =
      typeof parsed.subject === 'string' && parsed.subject.trim().length > 0 ? parsed.subject.trim() : fallback.subject;
    const bodyText =
      typeof parsed.body_text === 'string' && parsed.body_text.trim().length > 0
        ? parsed.body_text.trim()
        : fallback.bodyText;

    return {
      subject,
      bodyText,
      provider: generated.provider
    };
  }

  async composeDraftFromTemplate(input: {
    promptTemplate: string;
    context: TemplateComposeInput;
    templateSubject: string;
    templateBody: string;
  }): Promise<{ subject: string; bodyText: string; provider: 'openai' | 'gemini' | 'fallback' }> {
    const fallback = {
      subject: input.templateSubject,
      bodyText: input.templateBody
    };

    if (!this.hasProviderKey()) {
      return { ...fallback, provider: 'fallback' };
    }

    const prompt = [
      input.promptTemplate,
      '',
      'Ban la sales assistant. Nhiem vu: ca nhan hoa NOI DUNG tu TEMPLATE SAN CO, khong viet lai tu dau.',
      'Bat buoc giu giong van chuyen nghiep, ngan gon, co CTA.',
      'Bat buoc giu cau chao mo dau neu da co trong template.',
      'Return strict JSON with keys: subject, body_text',
      `context: ${JSON.stringify(input.context)}`,
      `template_subject: ${JSON.stringify(input.templateSubject)}`,
      `template_body: ${JSON.stringify(input.templateBody)}`
    ].join('\n');

    const generated = await this.generateText(prompt, 'balanced');
    if (!generated.text) {
      return { ...fallback, provider: 'fallback' };
    }

    const parsed = this.safeParseCleanJson(generated.text);
    if (!parsed) {
      return { ...fallback, provider: 'fallback' };
    }

    const subject =
      typeof parsed.subject === 'string' && parsed.subject.trim().length > 0
        ? parsed.subject.trim()
        : fallback.subject;
    const bodyText =
      typeof parsed.body_text === 'string' && parsed.body_text.trim().length > 0
        ? parsed.body_text.trim()
        : fallback.bodyText;

    return {
      subject,
      bodyText,
      provider: generated.provider
    };
  }

  async generateProspectCompanyReport(input: ProspectCompanyReportInput): Promise<ProspectCompanyReportResult> {
    const fallback = this.fallbackProspectCompanyReport(input);

    if (!this.hasProviderKey()) {
      return {
        ...fallback,
        provider: 'fallback'
      };
    }

    const prompt = [
      input.promptTemplate,
      '',
      'Ban la strategic B2B researcher. Nhiem vu: tong hop thong tin cong ty thanh bao cao action-ready cho sales.',
      'Tra ve DUY NHAT 1 JSON object hop le, khong markdown.',
      'Schema bat buoc:',
      JSON.stringify(
        {
          executive_summary: 'string',
          company_overview: {
            name: 'string',
            domain: 'string|null',
            industry: 'string|null',
            region: 'string|null',
            summary: 'string|null'
          },
          key_person: {
            name: 'string',
            title: 'string|null',
            email: 'string|null',
            phone: 'string|null',
            linkedin: 'string|null'
          },
          all_key_persons: [
            {
              name: 'string',
              title: 'string|null',
              email: 'string|null',
              phone: 'string|null',
              confidence_0_1: 'number|null',
              source: 'string|null'
            }
          ],
          buying_signals: ['string'],
          risks: ['string'],
          recommended_next_steps: ['string'],
          qualification_score_100: 'number|null',
          data_quality_notes: ['string']
        },
        null,
        2
      ),
      `Prospect normalized input: ${JSON.stringify(input.prospect)}`,
      `All key persons in this company/job: ${JSON.stringify(input.relatedKeyPersons ?? [])}`,
      `Cleaned AI profile: ${JSON.stringify(input.cleanedProfile ?? null)}`,
      `Raw snapshots(sample): ${JSON.stringify(this.trimSnapshots(input.snapshots))}`,
      'Yeu cau: tong hop DAY DU all_key_persons, khong bo sot nguoi. Viet ngan gon, dung du lieu thuc te tu input, khong bịa.'
    ].join('\n');

    const generated = await this.generateText(prompt, input.modelKind ?? 'balanced');
    if (!generated.text) {
      return {
        ...fallback,
        provider: 'fallback'
      };
    }

    const parsed = this.safeParseCleanJson(generated.text);
    if (!parsed) {
      return {
        ...fallback,
        provider: 'fallback'
      };
    }

    const reportJson = this.normalizeProspectCompanyReport(parsed, fallback.reportJson);
    const reportMarkdown = this.renderProspectCompanyReportMarkdown(reportJson);
    const confidenceScore = this.readNumber(reportJson.qualification_score_100, 0, 100);

    return {
      reportJson,
      reportMarkdown,
      confidenceScore,
      provider: generated.provider
    };
  }

  private trimSnapshots(snapshots: ProspectRawSnapshot[]): ProspectRawSnapshot[] {
    return snapshots.map((item) => ({
      ...item,
      rawJson: this.trimJson(item.rawJson, 5000)
    }));
  }

  private trimJson(value: unknown, maxChars: number): unknown {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    if (!raw) {
      return value;
    }

    if (raw.length <= maxChars) {
      return value;
    }

    return raw.slice(0, maxChars) + '...<trimmed>';
  }

  private safeParseCleanJson(text: string): Record<string, unknown> | null {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const matched = text.match(/\{[\s\S]*\}/);
      if (!matched) {
        return null;
      }
      try {
        return JSON.parse(matched[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  private normalizeCleanedOutput(
    value: Record<string, unknown>,
    fallback: CleanedProspectForSheet
  ): CleanedProspectForSheet {
    const sourceList = Array.isArray(value.source_list)
      ? value.source_list.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : fallback.source_list;

    const confidenceRaw = value.confidence_score;
    const confidenceScore =
      typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
        ? Number(Math.max(0, Math.min(1, confidenceRaw)).toFixed(2))
        : fallback.confidence_score;

    return {
      company_name: this.readString(value.company_name) ?? fallback.company_name,
      company_domain: this.cleanDomain(this.readString(value.company_domain)) ?? fallback.company_domain,
      company_industry: this.readString(value.company_industry) ?? fallback.company_industry,
      company_region: this.readString(value.company_region) ?? fallback.company_region,
      company_summary: this.readString(value.company_summary) ?? fallback.company_summary,
      key_person_name: this.readString(value.key_person_name) ?? fallback.key_person_name,
      key_person_title: this.readString(value.key_person_title) ?? fallback.key_person_title,
      key_person_email: this.cleanEmail(this.readString(value.key_person_email)) ?? fallback.key_person_email,
      key_person_phone: this.readString(value.key_person_phone) ?? fallback.key_person_phone,
      key_person_linkedin: this.readString(value.key_person_linkedin) ?? fallback.key_person_linkedin,
      confidence_score: confidenceScore,
      source_list: sourceList.length > 0 ? sourceList : fallback.source_list,
      notes: this.readString(value.notes) ?? fallback.notes
    };
  }

  private fallbackCleanProspect(
    prospect: ProspectSheetRecord,
    snapshots: ProspectRawSnapshot[]
  ): CleanedProspectForSheet {
    const sources = Array.from(new Set(snapshots.map((item) => item.source).filter(Boolean)));
    const confidenceValue = prospect.confidence ? Number(prospect.confidence) : null;

    return {
      company_name: prospect.companyName,
      company_domain: this.cleanDomain(prospect.companyDomain),
      company_industry: prospect.companyIndustry,
      company_region: prospect.companyRegion,
      company_summary: null,
      key_person_name: prospect.personName,
      key_person_title: prospect.personTitle,
      key_person_email: this.cleanEmail(prospect.personEmail),
      key_person_phone: prospect.personPhone,
      key_person_linkedin: prospect.personLinkedinUrl,
      confidence_score:
        confidenceValue !== null && Number.isFinite(confidenceValue)
          ? Number(Math.max(0, Math.min(1, confidenceValue)).toFixed(2))
          : null,
      source_list: sources,
      notes: 'fallback_cleaner'
    };
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private cleanDomain(value: string | null): string | null {
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

  private cleanEmail(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.includes('@') ? normalized : null;
  }

  private fallbackComposeDraft(prospect: ProspectComposeInput): { subject: string; bodyText: string } {
    const industry = prospect.companyIndustry ?? 'doanh nghiep';
    const title = prospect.personTitle ?? 'Anh/Chi';
    return {
      subject: `De xuat trao doi ve giai phap bao mat cho ${prospect.companyName}`,
      bodyText: [
        `Kinh gui ${title} ${prospect.personName},`,
        '',
        `Em la tu van giai phap tai VNETWORK. Ben em da nghien cuu nhanh ve ${prospect.companyName} (${industry}) va nhan thay co the ho tro them cho bai toan an toan he thong va van hanh on dinh.`,
        '',
        'Neu Anh/Chi phu hop, em xin phep hen 15-20 phut de chia se de xuat tong quan.',
        '',
        'Tran trong,',
        'VNETWORK Sales Team'
      ].join('\n')
    };
  }

  private fallbackProspectCompanyReport(input: ProspectCompanyReportInput): {
    reportMarkdown: string;
    reportJson: Record<string, unknown>;
    confidenceScore: number | null;
  } {
    const confidenceScore =
      input.cleanedProfile?.confidenceScore !== null && input.cleanedProfile?.confidenceScore !== undefined
        ? Number(Math.max(0, Math.min(100, input.cleanedProfile.confidenceScore * 100)).toFixed(0))
        : null;
    const sourceList =
      input.cleanedProfile?.sourceList && input.cleanedProfile.sourceList.length > 0
        ? input.cleanedProfile.sourceList
        : Array.from(new Set(input.snapshots.map((item) => item.source).filter(Boolean)));
    const summary =
      input.cleanedProfile?.companySummary ??
      `${input.prospect.companyName} dang nam trong tap prospect can tiep can B2B. Nen bo sung du lieu doanh nghiep chi tiet de nang do chinh xac.`;
    const reportJson: Record<string, unknown> = {
      executive_summary: `${input.prospect.companyName} la prospect trong nganh ${input.prospect.companyIndustry ?? 'chua ro'}. Muc do uu tien hien tai o muc trung binh va can them xac minh truoc khi outreach quy mo lon.`,
      company_overview: {
        name: input.prospect.companyName,
        domain: input.prospect.companyDomain,
        industry: input.prospect.companyIndustry,
        region: input.prospect.companyRegion,
        summary
      },
      key_person: {
        name: input.prospect.personName,
        title: input.prospect.personTitle,
        email: input.prospect.personEmail,
        phone: input.prospect.personPhone,
        linkedin: input.cleanedProfile?.keyPersonLinkedin ?? null
      },
      all_key_persons:
        input.relatedKeyPersons?.map((item) => ({
          name: item.name,
          title: item.title,
          email: item.email,
          phone: item.phone,
          confidence_0_1: item.confidence,
          source: item.source
        })) ?? [],
      buying_signals: [
        'Da xac dinh duoc key person de tiep can.',
        'Da co company-domain va nganh co ban de phan loai lead.'
      ],
      risks: [
        'Thong tin quy mo va ngan sach chua du de du bao nhu cau mua.',
        'Can bo sung them du lieu external de giam rui ro outreach sai doi tuong.'
      ],
      recommended_next_steps: [
        'Xac minh lai company profile tu website/LinkedIn trong 24h.',
        'Chuan bi message mo dau theo nganh va pain point cu the.',
        'Tien hanh outreach nho gon va theo doi phan hoi trong 3-5 ngay.'
      ],
      qualification_score_100: confidenceScore,
      data_quality_notes: [
        sourceList.length > 0 ? `Nguon du lieu: ${sourceList.join(', ')}` : 'Nguon du lieu chua day du.',
        input.cleanedProfile?.notes ?? 'Bao cao fallback duoc tao khi AI service khong phan hoi hop le.'
      ]
    };

    return {
      reportJson,
      reportMarkdown: this.renderProspectCompanyReportMarkdown(reportJson),
      confidenceScore
    };
  }

  private normalizeProspectCompanyReport(
    raw: Record<string, unknown>,
    fallback: Record<string, unknown>
  ): Record<string, unknown> {
    const fallbackCompany = (fallback.company_overview as Record<string, unknown>) ?? {};
    const fallbackKeyPerson = (fallback.key_person as Record<string, unknown>) ?? {};
    const fallbackAllKeyPersons = Array.isArray(fallback.all_key_persons) ? fallback.all_key_persons : [];

    return {
      executive_summary: this.readString(raw.executive_summary) ?? (fallback.executive_summary as string),
      company_overview: {
        name: this.readString(this.readObject(raw.company_overview)?.name) ?? (fallbackCompany.name as string),
        domain: this.readString(this.readObject(raw.company_overview)?.domain) ?? (fallbackCompany.domain as string | null),
        industry:
          this.readString(this.readObject(raw.company_overview)?.industry) ?? (fallbackCompany.industry as string | null),
        region: this.readString(this.readObject(raw.company_overview)?.region) ?? (fallbackCompany.region as string | null),
        summary: this.readString(this.readObject(raw.company_overview)?.summary) ?? (fallbackCompany.summary as string | null)
      },
      key_person: {
        name: this.readString(this.readObject(raw.key_person)?.name) ?? (fallbackKeyPerson.name as string),
        title: this.readString(this.readObject(raw.key_person)?.title) ?? (fallbackKeyPerson.title as string | null),
        email: this.readString(this.readObject(raw.key_person)?.email) ?? (fallbackKeyPerson.email as string | null),
        phone: this.readString(this.readObject(raw.key_person)?.phone) ?? (fallbackKeyPerson.phone as string | null),
        linkedin:
          this.readString(this.readObject(raw.key_person)?.linkedin) ?? (fallbackKeyPerson.linkedin as string | null)
      },
      all_key_persons: this.normalizeAllKeyPersons(raw.all_key_persons, fallbackAllKeyPersons),
      buying_signals: this.readStringArray(raw.buying_signals, fallback.buying_signals),
      risks: this.readStringArray(raw.risks, fallback.risks),
      recommended_next_steps: this.readStringArray(raw.recommended_next_steps, fallback.recommended_next_steps),
      qualification_score_100:
        this.readNumber(raw.qualification_score_100, 0, 100) ??
        (typeof fallback.qualification_score_100 === 'number' ? fallback.qualification_score_100 : null),
      data_quality_notes: this.readStringArray(raw.data_quality_notes, fallback.data_quality_notes)
    };
  }

  private renderProspectCompanyReportMarkdown(report: Record<string, unknown>): string {
    const company = (report.company_overview as Record<string, unknown>) ?? {};
    const keyPerson = (report.key_person as Record<string, unknown>) ?? {};
    const allKeyPersons = Array.isArray(report.all_key_persons) ? report.all_key_persons : [];
    const lines = [
      `# Bao Cao Tong Hop Cong Ty: ${String(company.name ?? 'N/A')}`,
      '',
      '## Executive Summary',
      String(report.executive_summary ?? 'N/A'),
      '',
      '## Company Overview',
      `- Domain: ${String(company.domain ?? 'N/A')}`,
      `- Industry: ${String(company.industry ?? 'N/A')}`,
      `- Region: ${String(company.region ?? 'N/A')}`,
      `- Summary: ${String(company.summary ?? 'N/A')}`,
      '',
      '## Key Person',
      `- Name: ${String(keyPerson.name ?? 'N/A')}`,
      `- Title: ${String(keyPerson.title ?? 'N/A')}`,
      `- Email: ${String(keyPerson.email ?? 'N/A')}`,
      `- Phone: ${String(keyPerson.phone ?? 'N/A')}`,
      `- LinkedIn: ${String(keyPerson.linkedin ?? 'N/A')}`,
      '',
      '## All Key Persons',
      ...this.renderAllKeyPersons(allKeyPersons),
      '',
      '## Buying Signals',
      ...this.renderBulletList(report.buying_signals),
      '',
      '## Risks',
      ...this.renderBulletList(report.risks),
      '',
      '## Recommended Next Steps',
      ...this.renderBulletList(report.recommended_next_steps),
      '',
      '## Data Quality Notes',
      ...this.renderBulletList(report.data_quality_notes),
      '',
      `Qualification Score (0-100): ${String(report.qualification_score_100 ?? 'N/A')}`
    ];

    return lines.join('\n');
  }

  private renderBulletList(value: unknown): string[] {
    const items = Array.isArray(value) ? value : [];
    const filtered = items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (filtered.length === 0) {
      return ['- N/A'];
    }
    return filtered.map((item) => `- ${item}`);
  }

  private readStringArray(value: unknown, fallback: unknown): string[] {
    const picked = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
    const normalized = picked.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return normalized.length > 0 ? normalized : ['N/A'];
  }

  private readObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readNumber(value: unknown, min: number, max: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Number(Math.max(min, Math.min(max, value)).toFixed(2));
  }

  private normalizeAllKeyPersons(value: unknown, fallback: unknown[]): Array<Record<string, unknown>> {
    const source = Array.isArray(value) ? value : fallback;
    const normalized: Array<Record<string, unknown>> = [];

    for (const item of source) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }

      const row = item as Record<string, unknown>;
      const name = this.readString(row.name);
      if (!name) {
        continue;
      }

      normalized.push({
        name,
        title: this.readString(row.title),
        email: this.readString(row.email),
        phone: this.readString(row.phone),
        confidence_0_1: this.readNumber(row.confidence_0_1, 0, 1),
        source: this.readString(row.source)
      });
    }

    return normalized;
  }

  private renderAllKeyPersons(items: unknown[]): string[] {
    if (!Array.isArray(items) || items.length === 0) {
      return ['- N/A'];
    }

    return items
      .map((item) => {
        const row = this.readObject(item) ?? {};
        const name = this.readString(row.name) ?? 'N/A';
        const title = this.readString(row.title) ?? 'N/A';
        const email = this.readString(row.email) ?? 'N/A';
        const phone = this.readString(row.phone) ?? 'N/A';
        const confidence = this.readNumber(row.confidence_0_1, 0, 1);
        const source = this.readString(row.source) ?? 'N/A';
        const confidenceText = confidence === null ? 'N/A' : confidence.toFixed(2);
        return `- ${name} | ${title} | ${email} | ${phone} | confidence=${confidenceText} | source=${source}`;
      })
      .slice(0, 100);
  }
}
