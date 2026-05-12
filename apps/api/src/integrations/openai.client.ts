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
  industryNormalized: IndustryNormalized | null;
  industryConfidence: number | null;
}

export interface CompanyAliasResult {
  canonical: string | null;
  aliases: string[];
  provider: 'openai' | 'gemini' | 'fallback';
}

export const INDUSTRY_NORMALIZED_VALUES = [
  'securities',
  'banking',
  'fintech',
  'insurance',
  'ecommerce',
  'manufacturing',
  'logistics',
  'retail',
  'education',
  'healthcare',
  'real_estate',
  'media',
  'technology',
  'telecom',
  'government',
  'energy',
  'other'
] as const;
export type IndustryNormalized = (typeof INDUSTRY_NORMALIZED_VALUES)[number];

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

  /**
   * Expand a user-typed company name into the canonical legal name plus common aliases.
   * Used by the discovery pipeline so external APIs (Apollo, LinkedIn, Hunter) can match
   * records that store the long form (e.g. user types "Vietcombank" → we query both
   * "Vietcombank" and "Joint Stock Commercial Bank for Foreign Trade of Vietnam").
   */
  async expandCompanyAliases(input: { query: string; region?: string | null }): Promise<CompanyAliasResult> {
    const trimmedQuery = (input.query ?? '').trim();
    if (!trimmedQuery) {
      return { canonical: null, aliases: [], provider: 'fallback' };
    }
    if (!this.hasProviderKey()) {
      return { canonical: null, aliases: [], provider: 'fallback' };
    }

    const prompt = [
      'Bạn là chuyên gia định danh doanh nghiệp Việt Nam và quốc tế.',
      'Cho 1 query người dùng nhập (có thể là tên viết tắt, mã ticker, hoặc tên rút gọn).',
      'Trả về DUY NHẤT 1 JSON object với schema:',
      JSON.stringify(
        {
          canonical: 'string|null — tên đầy đủ, chính thức (legal name), thường là tên đăng ký kinh doanh',
          aliases: ['string — các tên gọi phổ biến khác: viết tắt, tên tiếng Anh, tên tiếng Việt, mã ticker, brand name; KHÔNG lặp lại canonical']
        },
        null,
        2
      ),
      '',
      `Query: ${JSON.stringify(trimmedQuery)}`,
      `Region: ${JSON.stringify(input.region ?? 'VN')}`,
      '',
      'Quy tắc:',
      '- canonical: nếu là doanh nghiệp Việt Nam, ưu tiên tên đầy đủ Tiếng Anh (vì các nguồn dữ liệu B2B như Apollo dùng Tiếng Anh). Vd: "Vietcombank" → "Joint Stock Commercial Bank for Foreign Trade of Vietnam".',
      '- aliases: 2-5 biến thể, gồm cả tên Tiếng Việt đầy đủ ("Ngân hàng TMCP Ngoại thương Việt Nam"), viết tắt ("VCB"), brand name, không nhắc lại canonical.',
      '- Nếu KHÔNG chắc chắn (không nhận ra doanh nghiệp), trả canonical=null và aliases=[].',
      '- TUYỆT ĐỐI không bịa tên doanh nghiệp không tồn tại.',
      'Trả JSON, không markdown, không text ngoài JSON.'
    ].join('\n');

    const generated = await this.generateText(prompt, 'fast');
    if (!generated.text) {
      return { canonical: null, aliases: [], provider: 'fallback' };
    }
    const parsed = this.safeParseCleanJson(generated.text);
    if (!parsed) {
      return { canonical: null, aliases: [], provider: 'fallback' };
    }

    const canonical = this.readString(parsed.canonical);
    const aliasesRaw = Array.isArray(parsed.aliases) ? parsed.aliases : [];
    const aliases = aliasesRaw
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());

    // Dedup case-insensitively, drop entries equal to the user-typed query or to canonical.
    const seen = new Set<string>();
    if (canonical) seen.add(canonical.toLowerCase());
    seen.add(trimmedQuery.toLowerCase());
    const dedupedAliases: string[] = [];
    for (const alias of aliases) {
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedAliases.push(alias);
    }

    return {
      canonical,
      aliases: dedupedAliases.slice(0, 5),
      provider: generated.provider
    };
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
      'Toàn bộ subject và body BẮT BUỘC viết bằng tiếng Việt có dấu, văn phong chuyên nghiệp, ngắn gọn, lịch sự, kèm CTA mời trao đổi 15-20 phút.',
      'Trả về JSON nghiêm ngặt với key: subject, body_text.',
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
      'Bạn là Sales Assistant. Nhiệm vụ: cá nhân hóa NỘI DUNG từ TEMPLATE SẴN CÓ, KHÔNG viết lại từ đầu.',
      'BẮT BUỘC giữ giọng văn chuyên nghiệp, ngắn gọn, có CTA, toàn bộ tiếng Việt có dấu.',
      'BẮT BUỘC giữ nguyên câu chào mở đầu nếu đã có trong template.',
      'Chỉ thay các placeholder/biến trong template bằng dữ liệu từ context, KHÔNG thêm đoạn mới ngoài template.',
      'Trả về JSON nghiêm ngặt với key: subject, body_text.',
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
      'Bạn là chuyên gia nghiên cứu B2B chiến lược. Nhiệm vụ: tổng hợp thông tin công ty thành bản báo cáo sẵn-sàng-hành-động cho đội Sales.',
      'NGÔN NGỮ: toàn bộ nội dung văn xuôi (executive_summary, company_overview.summary, buying_signals, risks, recommended_next_steps, data_quality_notes) BẮT BUỘC viết bằng tiếng Việt có dấu, văn phong chuyên nghiệp, ngắn gọn, không dùng emoji.',
      'Trả về DUY NHẤT một JSON object hợp lệ, KHÔNG kèm markdown, KHÔNG kèm văn bản ngoài JSON.',
      'Schema bắt buộc:',
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
          outreach_hooks: [
            {
              hook: 'string (sự kiện/tín hiệu cụ thể có thể dùng làm cớ tiếp cận)',
              evidence_url: 'string|null',
              use_in: 'enum (subject|opener|follow_up)'
            }
          ],
          firmographics: {
            employee_count_range: 'string|null (vd: "100-500", "1k-5k")',
            revenue_range_usd: 'string|null (vd: "10M-50M USD")',
            funding_stage: 'string|null (vd: "Series B", "Bootstrapped", "Public")',
            founded_year: 'number|null'
          },
          sources: [
            {
              url: 'string (URL nguồn có thể truy cập)',
              title: 'string|null (tiêu đề trang/bài viết)',
              claim_supported: 'string|null (claim trong report mà nguồn này dẫn chứng)'
            }
          ],
          qualification_score_100: 'number|null',
          data_quality_notes: ['string'],
          industry_normalized: `enum (${INDUSTRY_NORMALIZED_VALUES.join('|')})`,
          industry_confidence: 'number 0..1'
        },
        null,
        2
      ),
      `Prospect đã chuẩn hóa: ${JSON.stringify(input.prospect)}`,
      `Toàn bộ key persons trong công ty/job: ${JSON.stringify(input.relatedKeyPersons ?? [])}`,
      `Hồ sơ AI đã làm sạch: ${JSON.stringify(input.cleanedProfile ?? null)}`,
      `Mẫu raw snapshots: ${JSON.stringify(this.trimSnapshots(input.snapshots))}`,
      'Yêu cầu: tổng hợp ĐẦY ĐỦ all_key_persons, không bỏ sót người. Viết ngắn gọn, chỉ dùng dữ liệu thực tế từ input, KHÔNG bịa thông tin không có trong nguồn.',
      'outreach_hooks: mỗi hook là một sự kiện/tín hiệu CỤ THỂ Sales có thể dùng làm cớ mở đầu (vd: "Vừa promote lên CIO 2 tháng trước", "Tuần trước có thông cáo về cloud migration"). KHÔNG viết generic như "ngành đang chuyển đổi số". Mỗi hook BẮT BUỘC có evidence_url khi có thể trích từ snapshot; nếu không có URL gốc, để null. Tối thiểu 1-3 hook nếu input đủ dữ liệu; nếu không tìm được hook cụ thể, trả mảng rỗng [].',
      'firmographics: chỉ điền các field có nguồn rõ ràng; field nào không có dữ liệu thì để null, KHÔNG đoán.',
      'sources: liệt kê các URL nguồn dùng trong báo cáo (bóc từ raw snapshots nếu có). Mỗi item có URL + title + claim_supported (claim nào trong report dẫn chứng từ nguồn này — vd: "key_person.email", "buying_signals[0]"). Nếu không có URL rõ ràng, trả mảng rỗng [].',
      `industry_normalized BẮT BUỘC chọn một trong enum: ${INDUSTRY_NORMALIZED_VALUES.join(', ')}. Ánh xạ các ngành tiếng Việt/Anh về enum này (ví dụ: "Công ty chứng khoán" → securities; "Ngân hàng" → banking; "Thương mại điện tử/TMĐT" → ecommerce; "Công nghệ" → technology; "Sản xuất" → manufacturing). Nếu không xác định được, chọn "other" và đặt industry_confidence < 0.4.`
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
    const industryNormalized = this.toIndustryEnum(reportJson.industry_normalized) ??
      this.inferIndustryFromText(this.readString((reportJson.company_overview as Record<string, unknown> | undefined)?.industry));
    const industryConfidence = this.readNumber(reportJson.industry_confidence, 0, 1);

    return {
      reportJson,
      reportMarkdown,
      confidenceScore,
      provider: generated.provider,
      industryNormalized,
      industryConfidence
    };
  }

  private toIndustryEnum(value: unknown): IndustryNormalized | null {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase().replace(/\s+/g, '_');
    return (INDUSTRY_NORMALIZED_VALUES as readonly string[]).includes(key)
      ? (key as IndustryNormalized)
      : null;
  }

  private inferIndustryFromText(industryText: string | null | undefined): IndustryNormalized | null {
    const text = (industryText ?? '').toLowerCase();
    if (!text.trim()) return null;
    const rules: Array<[string[], IndustryNormalized]> = [
      [['chứng khoán', 'chung khoan', 'securities', 'brokerage', 'broker'], 'securities'],
      [['ngân hàng', 'ngan hang', 'bank'], 'banking'],
      [['bảo hiểm', 'bao hiem', 'insurance'], 'insurance'],
      [['fintech'], 'fintech'],
      [['thương mại điện tử', 'thuong mai dien tu', 'tmdt', 'ecommerce', 'e-commerce', 'marketplace'], 'ecommerce'],
      [['sản xuất', 'san xuat', 'manufactur', 'industrial'], 'manufacturing'],
      [['logistics', 'vận tải', 'van tai', 'shipping', 'forwarder'], 'logistics'],
      [['retail', 'bán lẻ', 'ban le'], 'retail'],
      [['education', 'giáo dục', 'giao duc', 'edtech'], 'education'],
      [['health', 'y tế', 'y te', 'pharma', 'hospital'], 'healthcare'],
      [['real estate', 'bất động sản', 'bat dong san'], 'real_estate'],
      [['media', 'truyền thông', 'truyen thong', 'publishing', 'broadcast'], 'media'],
      [['telecom', 'viễn thông', 'vien thong', 'isp'], 'telecom'],
      [['government', 'chính phủ', 'chinh phu', 'public sector'], 'government'],
      [['energy', 'năng lượng', 'nang luong', 'oil', 'gas', 'điện', 'dien luc'], 'energy'],
      [['saas', 'software', 'công nghệ', 'cong nghe', 'technology', 'ai ', 'platform'], 'technology']
    ];
    for (const [keywords, key] of rules) {
      if (keywords.some((kw) => text.includes(kw))) return key;
    }
    return null;
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
    const industry = prospect.companyIndustry ?? 'doanh nghiệp';
    const title = prospect.personTitle ?? 'Anh/Chị';
    return {
      subject: `Đề xuất trao đổi về giải pháp bảo mật cho ${prospect.companyName}`,
      bodyText: [
        `Kính gửi ${title} ${prospect.personName},`,
        '',
        `Em là tư vấn giải pháp tại VNETWORK. Bên em đã nghiên cứu nhanh về ${prospect.companyName} (${industry}) và nhận thấy có thể hỗ trợ thêm cho bài toán an toàn hệ thống và vận hành ổn định.`,
        '',
        'Nếu Anh/Chị phù hợp, em xin phép hẹn 15-20 phút để chia sẻ đề xuất tổng quan.',
        '',
        'Trân trọng,',
        'VNETWORK Sales Team'
      ].join('\n')
    };
  }

  private fallbackProspectCompanyReport(input: ProspectCompanyReportInput): {
    reportMarkdown: string;
    reportJson: Record<string, unknown>;
    confidenceScore: number | null;
    industryNormalized: IndustryNormalized | null;
    industryConfidence: number | null;
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
      `${input.prospect.companyName} đang nằm trong tập prospect cần tiếp cận B2B. Cần bổ sung thêm dữ liệu doanh nghiệp chi tiết để nâng độ chính xác.`;
    const reportJson: Record<string, unknown> = {
      executive_summary: `${input.prospect.companyName} là prospect trong ngành ${input.prospect.companyIndustry ?? 'chưa rõ'}. Mức ưu tiên hiện tại ở mức trung bình và cần xác minh thêm trước khi triển khai outreach quy mô lớn.`,
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
        'Đã xác định được người liên hệ chính để tiếp cận.',
        'Đã có tên miền công ty và ngành cơ bản để phân loại lead.'
      ],
      risks: [
        'Thông tin về quy mô và ngân sách chưa đủ để dự báo nhu cầu mua.',
        'Cần bổ sung thêm dữ liệu từ nguồn ngoài để giảm rủi ro outreach sai đối tượng.'
      ],
      recommended_next_steps: [
        'Xác minh lại hồ sơ công ty từ website/LinkedIn trong 24 giờ.',
        'Chuẩn bị thông điệp mở đầu theo ngành và pain point cụ thể.',
        'Tiến hành outreach nhỏ gọn và theo dõi phản hồi trong 3-5 ngày.'
      ],
      outreach_hooks: [],
      firmographics: {
        employee_count_range: null,
        revenue_range_usd: null,
        funding_stage: null,
        founded_year: null
      },
      sources: [],
      qualification_score_100: confidenceScore,
      data_quality_notes: [
        sourceList.length > 0 ? `Nguồn dữ liệu: ${sourceList.join(', ')}` : 'Nguồn dữ liệu chưa đầy đủ.',
        input.cleanedProfile?.notes ?? 'Báo cáo fallback được tạo khi dịch vụ AI không phản hồi hợp lệ.'
      ]
    };

    const industryNormalized = this.inferIndustryFromText(input.prospect.companyIndustry);
    if (industryNormalized) {
      reportJson.industry_normalized = industryNormalized;
      reportJson.industry_confidence = 0.3;
    }

    return {
      reportJson,
      reportMarkdown: this.renderProspectCompanyReportMarkdown(reportJson),
      confidenceScore,
      industryNormalized,
      industryConfidence: industryNormalized ? 0.3 : null
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
      outreach_hooks: this.normalizeOutreachHooks(raw.outreach_hooks),
      firmographics: this.normalizeFirmographics(this.readObject(raw.firmographics)),
      sources: this.normalizeSources(raw.sources),
      qualification_score_100:
        this.readNumber(raw.qualification_score_100, 0, 100) ??
        (typeof fallback.qualification_score_100 === 'number' ? fallback.qualification_score_100 : null),
      data_quality_notes: this.readStringArray(raw.data_quality_notes, fallback.data_quality_notes),
      industry_normalized: this.toIndustryEnum(raw.industry_normalized) ??
        (typeof fallback.industry_normalized === 'string' ? fallback.industry_normalized : null),
      industry_confidence:
        this.readNumber(raw.industry_confidence, 0, 1) ??
        (typeof fallback.industry_confidence === 'number' ? fallback.industry_confidence : null)
    };
  }

  private normalizeOutreachHooks(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    const allowedUseIn = new Set(['subject', 'opener', 'follow_up']);
    const normalized: Array<Record<string, unknown>> = [];

    for (const item of value) {
      const row = this.readObject(item);
      if (!row) continue;
      const hook = this.readString(row.hook);
      if (!hook) continue;
      const useIn = this.readString(row.use_in);
      normalized.push({
        hook,
        evidence_url: this.readString(row.evidence_url),
        use_in: useIn && allowedUseIn.has(useIn) ? useIn : 'opener'
      });
    }

    return normalized;
  }

  private normalizeFirmographics(value: Record<string, unknown> | null): Record<string, unknown> {
    if (!value) {
      return {
        employee_count_range: null,
        revenue_range_usd: null,
        funding_stage: null,
        founded_year: null
      };
    }

    const founded = typeof value.founded_year === 'number'
      ? Math.round(value.founded_year)
      : null;

    return {
      employee_count_range: this.readString(value.employee_count_range),
      revenue_range_usd: this.readString(value.revenue_range_usd),
      funding_stage: this.readString(value.funding_stage),
      founded_year: founded !== null && founded >= 1800 && founded <= 2100 ? founded : null
    };
  }

  private normalizeSources(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    const normalized: Array<Record<string, unknown>> = [];

    for (const item of value) {
      const row = this.readObject(item);
      if (!row) continue;
      const url = this.readString(row.url);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      normalized.push({
        url,
        title: this.readString(row.title),
        claim_supported: this.readString(row.claim_supported)
      });
    }

    return normalized;
  }

  private renderProspectCompanyReportMarkdown(report: Record<string, unknown>): string {
    const company = (report.company_overview as Record<string, unknown>) ?? {};
    const keyPerson = (report.key_person as Record<string, unknown>) ?? {};
    const allKeyPersons = Array.isArray(report.all_key_persons) ? report.all_key_persons : [];
    const firmographics = (report.firmographics as Record<string, unknown>) ?? {};
    const outreachHooks = Array.isArray(report.outreach_hooks) ? report.outreach_hooks : [];
    const sources = Array.isArray(report.sources) ? report.sources : [];
    const industryNormalized = report.industry_normalized;
    const industryConfidence = report.industry_confidence;
    const lines = [
      `# Báo cáo tổng hợp công ty: ${String(company.name ?? 'N/A')}`,
      '',
      '## Tóm tắt điều hành',
      String(report.executive_summary ?? 'N/A'),
      '',
      '## Tổng quan công ty',
      `- Tên miền: ${String(company.domain ?? 'N/A')}`,
      `- Ngành: ${String(company.industry ?? 'N/A')}`,
      `- Khu vực: ${String(company.region ?? 'N/A')}`,
      `- Mô tả ngắn: ${String(company.summary ?? 'N/A')}`,
      `- Phân loại ngành chuẩn hóa: ${String(industryNormalized ?? 'N/A')}${
        typeof industryConfidence === 'number' ? ` (độ tin cậy ${industryConfidence.toFixed(2)})` : ''
      }`,
      '',
      '## Firmographics',
      `- Quy mô nhân sự: ${String(firmographics.employee_count_range ?? 'N/A')}`,
      `- Doanh thu (USD): ${String(firmographics.revenue_range_usd ?? 'N/A')}`,
      `- Giai đoạn vốn: ${String(firmographics.funding_stage ?? 'N/A')}`,
      `- Năm thành lập: ${String(firmographics.founded_year ?? 'N/A')}`,
      '',
      '## Người liên hệ chính',
      `- Họ tên: ${String(keyPerson.name ?? 'N/A')}`,
      `- Chức danh: ${String(keyPerson.title ?? 'N/A')}`,
      `- Email: ${String(keyPerson.email ?? 'N/A')}`,
      `- Điện thoại: ${String(keyPerson.phone ?? 'N/A')}`,
      `- LinkedIn: ${String(keyPerson.linkedin ?? 'N/A')}`,
      '',
      '## Toàn bộ người liên hệ',
      ...this.renderAllKeyPersons(allKeyPersons),
      '',
      '## Outreach Hooks (cớ tiếp cận cụ thể)',
      ...this.renderOutreachHooksMarkdown(outreachHooks),
      '',
      '## Tín hiệu mua hàng',
      ...this.renderBulletList(report.buying_signals),
      '',
      '## Rủi ro',
      ...this.renderBulletList(report.risks),
      '',
      '## Bước tiếp theo đề xuất',
      ...this.renderBulletList(report.recommended_next_steps),
      '',
      '## Nguồn dẫn chứng',
      ...this.renderSourcesMarkdown(sources),
      '',
      '## Ghi chú chất lượng dữ liệu',
      ...this.renderBulletList(report.data_quality_notes),
      '',
      `Điểm đánh giá prospect (0-100): ${String(report.qualification_score_100 ?? 'N/A')}`
    ];

    return lines.join('\n');
  }

  private renderOutreachHooksMarkdown(hooks: unknown[]): string[] {
    if (!Array.isArray(hooks) || hooks.length === 0) return ['- N/A'];
    return hooks
      .map((item) => this.readObject(item))
      .filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => {
        const hook = this.readString(row.hook) ?? 'N/A';
        const useIn = this.readString(row.use_in) ?? 'opener';
        const evidence = this.readString(row.evidence_url);
        const evidenceText = evidence ? ` — nguồn: ${evidence}` : '';
        return `- [${useIn}] ${hook}${evidenceText}`;
      });
  }

  private renderSourcesMarkdown(sources: unknown[]): string[] {
    if (!Array.isArray(sources) || sources.length === 0) return ['- N/A'];
    return sources
      .map((item) => this.readObject(item))
      .filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => {
        const url = this.readString(row.url) ?? '';
        const title = this.readString(row.title);
        const claim = this.readString(row.claim_supported);
        const titlePart = title ? `${title} — ` : '';
        const claimPart = claim ? ` (dẫn chứng cho: ${claim})` : '';
        return `- ${titlePart}${url}${claimPart}`;
      });
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
        return `- ${name} | ${title} | ${email} | ${phone} | độ tin cậy=${confidenceText} | nguồn=${source}`;
      })
      .slice(0, 100);
  }
}
