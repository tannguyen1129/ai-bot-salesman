import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PgService } from '../database/pg.service';
import {
  CreateSearchJobDto,
  EmailSafeModePreviewDto,
  ListDraftsQueryDto,
  ReviewDraftDto
} from './p1.dto';
import { OpenAiClient, ProspectComposeInput, ProspectRawSnapshot } from '../integrations/openai.client';
import { P1TelegramService } from './p1.telegram.service';

interface SearchJobRecord {
  id: string;
  keyword: string;
  industry: string | null;
  region: string | null;
  target_role: string | null;
  source: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  total_prospects: number;
  error_message: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProspectRecord {
  id: string;
  search_job_id: string;
  company: string;
  domain: string | null;
  person_name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  source: string;
  confidence: string | null;
  status: 'new' | 'qualified' | 'contacted' | 'meeting' | 'disqualified' | 'archived';
  ai_profile_status?: string | null;
  ai_cleaned_company_summary?: string | null;
  ai_cleaned_confidence_score?: string | null;
  ai_cleaned_key_person_name?: string | null;
  ai_cleaned_key_person_title?: string | null;
  ai_cleaned_key_person_email?: string | null;
  ai_cleaned_source_list?: string[] | null;
  ai_cleaned_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface DraftRecord {
  id: string;
  prospect_id: string | null;
  company_id: string | null;
  subject: string;
  body_text: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  compose_mode: string;
  edit_count: number;
  reject_reason: string | null;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
}

interface ProspectForDraft {
  prospect_id: string;
  company_id: string | null;
  company_name: string;
  company_industry: string | null;
  person_name: string;
  person_title: string | null;
  person_email: string | null;
}

interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface FeatureFlagRecord {
  key: string;
  value: unknown;
}

interface SafeModeConfig {
  enableExternalSend: boolean;
  outboundRedirectTarget: string;
  smtpAllowlistDomains: string[];
}

interface ProspectCompanyReportRecord {
  id: string;
  prospect_id: string;
  search_job_id: string | null;
  company_name: string;
  report_markdown: string;
  report_json: Record<string, unknown>;
  provider: 'openai' | 'fallback';
  source_count: number;
  confidence_score: string | null;
  generated_at: string;
  updated_at: string;
}

interface ProspectReportInputRow {
  prospect_id: string;
  search_job_id: string | null;
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_region: string | null;
  person_name: string;
  person_title: string | null;
  person_email: string | null;
  person_phone: string | null;
  prospect_source: string;
  ai_company_summary: string | null;
  ai_key_person_linkedin: string | null;
  ai_confidence_score: string | null;
  ai_source_list: unknown;
  ai_notes: string | null;
}

interface SnapshotForReportRow {
  source: string;
  entity_type: string;
  entity_id: string | null;
  raw_json: unknown;
}

@Injectable()
export class P1Service {
  constructor(
    private readonly pg: PgService,
    private readonly openAi: OpenAiClient,
    private readonly telegram: P1TelegramService,
    @InjectQueue('p1-sheets-sync') private readonly syncQueue: Queue,
    @InjectQueue('p1-discovery') private readonly discoveryQueue: Queue,
    @InjectQueue('p1-email-send') private readonly emailSendQueue: Queue
  ) {}

  async createSearchJob(dto: CreateSearchJobDto): Promise<{
    jobId: string;
    status: 'queued';
    message: string;
  }> {
    const companyKeyword = dto.companyName?.trim() ?? dto.keyword?.trim();
    if (!companyKeyword) {
      throw new BadRequestException('companyName (hoac keyword) la bat buoc');
    }

    const source = dto.source?.trim() || 'manual';
    const industry = dto.industry?.trim() || null;

    const createdRows = await this.pg.query<SearchJobRecord>(
      `INSERT INTO search_jobs (keyword, industry, region, target_role, source, status)
       VALUES ($1, $2, $3, $4, $5, 'queued')
       RETURNING *`,
      [companyKeyword, industry, dto.region?.trim() ?? null, null, source]
    );

    const job = createdRows[0];
    await this.writeAudit('system', 'search_job.created', 'search_job', job.id, {
      keyword: job.keyword,
      companyName: companyKeyword,
      industry: industry ?? undefined,
      source: job.source
    });

    await this.enqueueDiscovery(job.id);

    return {
      jobId: job.id,
      status: 'queued',
      message: 'Search job created and queued for discovery'
    };
  }

  async getSearchJobById(id: string): Promise<SearchJobRecord> {
    const rows = await this.pg.query<SearchJobRecord>(
      `SELECT *
       FROM search_jobs
       WHERE id = $1`,
      [id]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Search job ${id} not found`);
    }

    return rows[0];
  }

  async retrySearchJob(id: string, actor: string): Promise<{ jobId: string; status: 'queued' }> {
    const rows = await this.pg.query<SearchJobRecord>(
      `UPDATE search_jobs
       SET status='queued',
           started_at=NULL,
           completed_at=NULL,
           error_message=NULL,
           updated_at=now()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Search job ${id} not found`);
    }

    await this.writeAudit(actor, 'search_job.retry_queued', 'search_job', id, {});
    await this.enqueueDiscovery(id);

    return {
      jobId: id,
      status: 'queued'
    };
  }

  async listSearchJobs(query: {
    status?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<PagedResult<SearchJobRecord>> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }

    if (query.q?.trim()) {
      params.push(`%${query.q.trim()}%`);
      conditions.push(`keyword ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.pg.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM search_jobs ${where}`, params);

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<SearchJobRecord>(
      `SELECT *
       FROM search_jobs
       ${where}
       ORDER BY created_at DESC
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

  async listProspects(query: {
    searchJobId?: string;
    status?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<PagedResult<ProspectRecord>> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.searchJobId) {
      params.push(query.searchJobId);
      conditions.push(`p.search_job_id = $${params.length}`);
    }

    if (query.status) {
      params.push(query.status);
      conditions.push(`p.status = $${params.length}`);
    }

    if (query.q?.trim()) {
      const like = `%${query.q.trim()}%`;
      params.push(like);
      conditions.push(
        `(p.company ILIKE $${params.length} OR p.person_name ILIKE $${params.length} OR COALESCE(p.email, '') ILIKE $${params.length} OR COALESCE(p.domain, '') ILIKE $${params.length})`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.pg.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM prospects p ${where}`, params);

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<ProspectRecord>(
      `SELECT
         p.*,
         aip.clean_status AS ai_profile_status,
         aip.company_summary AS ai_cleaned_company_summary,
         aip.confidence_score::text AS ai_cleaned_confidence_score,
         aip.key_person_name AS ai_cleaned_key_person_name,
         aip.key_person_title AS ai_cleaned_key_person_title,
         aip.key_person_email AS ai_cleaned_key_person_email,
         COALESCE(
           ARRAY(
             SELECT jsonb_array_elements_text(aip.source_list)
           ),
           ARRAY[]::text[]
         ) AS ai_cleaned_source_list,
         aip.updated_at AS ai_cleaned_updated_at
       FROM prospects p
       LEFT JOIN prospect_ai_profiles aip ON aip.prospect_id = p.id
       ${where}
       ORDER BY p.created_at DESC
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

  async getProspectCompanyReport(prospectId: string): Promise<ProspectCompanyReportRecord> {
    const rows = await this.pg.query<ProspectCompanyReportRecord>(
      `SELECT *
       FROM prospect_company_reports
       WHERE prospect_id = $1`,
      [prospectId]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Company report for prospect ${prospectId} not found`);
    }

    return rows[0];
  }

  async generateProspectCompanyReport(prospectId: string, actor: string): Promise<ProspectCompanyReportRecord> {
    const rows = await this.pg.query<ProspectReportInputRow>(
      `SELECT
         p.id AS prospect_id,
         p.search_job_id,
         p.company AS company_name,
         p.domain AS company_domain,
         COALESCE(c.industry, p.industry) AS company_industry,
         c.region AS company_region,
         p.person_name,
         p.position AS person_title,
         p.email AS person_email,
         p.phone AS person_phone,
         p.source AS prospect_source,
         aip.company_summary AS ai_company_summary,
         aip.key_person_linkedin AS ai_key_person_linkedin,
         aip.confidence_score::text AS ai_confidence_score,
         aip.source_list AS ai_source_list,
         aip.notes AS ai_notes
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       LEFT JOIN prospect_ai_profiles aip ON aip.prospect_id = p.id
       WHERE p.id = $1`,
      [prospectId]
    );

    const prospect = rows[0];
    if (!prospect) {
      throw new NotFoundException(`Prospect ${prospectId} not found`);
    }

    const snapshots = await this.loadReportSnapshots(prospect.search_job_id);
    const promptTemplate = await this.getPromptTemplate('serialize');
    const confidenceValue =
      prospect.ai_confidence_score !== null && prospect.ai_confidence_score !== undefined
        ? Number(prospect.ai_confidence_score)
        : null;

    const report = await this.openAi.generateProspectCompanyReport({
      promptTemplate,
      prospect: {
        prospectId: prospect.prospect_id,
        companyName: prospect.company_name,
        companyDomain: prospect.company_domain,
        companyIndustry: prospect.company_industry,
        companyRegion: prospect.company_region,
        personName: prospect.person_name,
        personTitle: prospect.person_title,
        personEmail: prospect.person_email,
        personPhone: prospect.person_phone,
        source: prospect.prospect_source
      },
      cleanedProfile: {
        companySummary: prospect.ai_company_summary,
        keyPersonLinkedin: prospect.ai_key_person_linkedin,
        confidenceScore: confidenceValue !== null && Number.isFinite(confidenceValue) ? confidenceValue : null,
        sourceList: this.toStringArray(prospect.ai_source_list),
        notes: prospect.ai_notes
      },
      snapshots
    });

    const savedRows = await this.pg.query<ProspectCompanyReportRecord>(
      `INSERT INTO prospect_company_reports (
         prospect_id, search_job_id, company_name, report_markdown, report_json, provider, source_count, confidence_score, generated_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())
       ON CONFLICT (prospect_id) DO UPDATE
       SET
         search_job_id = EXCLUDED.search_job_id,
         company_name = EXCLUDED.company_name,
         report_markdown = EXCLUDED.report_markdown,
         report_json = EXCLUDED.report_json,
         provider = EXCLUDED.provider,
         source_count = EXCLUDED.source_count,
         confidence_score = EXCLUDED.confidence_score,
         generated_at = EXCLUDED.generated_at,
         updated_at = now()
       RETURNING *`,
      [
        prospect.prospect_id,
        prospect.search_job_id,
        prospect.company_name,
        report.reportMarkdown,
        JSON.stringify(report.reportJson),
        report.provider,
        snapshots.length,
        report.confidenceScore
      ]
    );

    const saved = savedRows[0];
    await this.writeAudit(actor, 'prospect.company_report.generated', 'prospect', prospect.prospect_id, {
      provider: saved.provider,
      sourceCount: saved.source_count,
      confidenceScore: saved.confidence_score
    });

    return saved;
  }

  async updateProspectStatus(id: string, status: ProspectRecord['status'], actor: string): Promise<ProspectRecord> {
    const rows = await this.pg.query<ProspectRecord>(
      `UPDATE prospects
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Prospect ${id} not found`);
    }

    await this.writeAudit(actor, 'prospect.status.updated', 'prospect', id, { status });
    await this.enqueueSheetSync(id);

    return rows[0];
  }

  async generateDraftForProspect(prospectId: string, actor: string): Promise<{ draftId: string; status: string }> {
    const rows = await this.pg.query<ProspectForDraft>(
      `SELECT
         p.id AS prospect_id,
         p.company_id,
         p.company AS company_name,
         COALESCE(c.industry, p.industry) AS company_industry,
         p.person_name,
         p.position AS person_title,
         p.email AS person_email
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.id = $1`,
      [prospectId]
    );

    const prospect = rows[0];
    if (!prospect) {
      throw new NotFoundException(`Prospect ${prospectId} not found`);
    }

    const promptTemplate = await this.getPromptTemplate('compose');
    const composeInput: ProspectComposeInput = {
      companyName: prospect.company_name,
      companyIndustry: prospect.company_industry,
      personName: prospect.person_name,
      personTitle: prospect.person_title,
      personEmail: prospect.person_email
    };

    const draft = await this.openAi.composeDraftEmail({
      prospect: composeInput,
      promptTemplate
    });

    const created = await this.pg.query<{ id: string }>(
      `INSERT INTO drafts (
         prospect_id, company_id, channel, compose_mode, subject, body_text, status
       ) VALUES ($1, $2, 'email', $3, $4, $5, 'pending_review')
       RETURNING id`,
      [
        prospect.prospect_id,
        prospect.company_id,
        draft.provider === 'openai' ? 'from_scratch' : 'from_template',
        draft.subject,
        draft.bodyText
      ]
    );

    const draftId = created[0].id;

    await this.pg.query(
      `INSERT INTO draft_review_logs (draft_id, reviewer_type, reviewer_id, action, old_status, new_status, note)
       VALUES ($1, 'system', $2, 'created', NULL, 'pending_review', $3)`,
      [draftId, actor, `provider=${draft.provider}`]
    );

    await this.writeAudit(actor, 'draft.created', 'draft', draftId, {
      prospectId,
      provider: draft.provider
    });

    await this.telegram.sendDraftReviewCard({
      draftId,
      company: prospect.company_name,
      person: prospect.person_name,
      intendedRecipient: prospect.person_email ?? 'unknown@invalid.local',
      subject: draft.subject
    });

    return { draftId, status: 'pending_review' };
  }

  async listDrafts(query: ListDraftsQueryDto): Promise<PagedResult<DraftRecord>> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.pg.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM drafts ${where}`, params);

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<DraftRecord>(
      `SELECT *
       FROM drafts
       ${where}
       ORDER BY created_at DESC
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

  async reviewDraft(
    draftId: string,
    dto: ReviewDraftDto,
    reviewer: string
  ): Promise<{ draftId: string; status: string }> {
    const rows = await this.pg.query<DraftRecord>(`SELECT * FROM drafts WHERE id = $1`, [draftId]);
    const draft = rows[0];
    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    let newStatus: DraftRecord['status'] = draft.status;

    if (dto.action === 'approve') {
      newStatus = 'approved';
      await this.pg.query(
        `UPDATE drafts
         SET status='approved', approved_at=now(), approved_as_is = $2
         WHERE id = $1`,
        [draftId, !dto.subject && !dto.bodyText]
      );
      await this.enqueueEmailSend(draftId);
    } else if (dto.action === 'reject') {
      newStatus = 'rejected';
      await this.pg.query(
        `UPDATE drafts
         SET status='rejected', reject_reason=$2
         WHERE id = $1`,
        [draftId, dto.rejectReason?.trim() || 'rejected_by_reviewer']
      );
    } else {
      const subject = dto.subject?.trim() || draft.subject;
      const bodyText = dto.bodyText?.trim() || draft.body_text;
      newStatus = 'pending_review';
      await this.pg.query(
        `UPDATE drafts
         SET subject=$2, body_text=$3, edit_count=edit_count+1, status='pending_review'
         WHERE id = $1`,
        [draftId, subject, bodyText]
      );
      await this.telegram.sendDraftReviewCard({
        draftId,
        company: 'updated',
        person: reviewer,
        intendedRecipient: 'updated@review.local',
        subject
      });
    }

    await this.pg.query(
      `INSERT INTO draft_review_logs (draft_id, reviewer_type, reviewer_id, action, old_status, new_status, note)
       VALUES ($1, 'human', $2, $3, $4, $5, $6)`,
      [draftId, reviewer, dto.action, draft.status, newStatus, dto.rejectReason ?? null]
    );

    await this.writeAudit(reviewer, `draft.${dto.action}`, 'draft', draftId, {
      from: draft.status,
      to: newStatus
    });

    return {
      draftId,
      status: newStatus
    };
  }

  async getEmailSafeModeConfig(): Promise<{
    enableExternalSend: boolean;
    outboundRedirectTarget: string;
    smtpAllowlistDomains: string[];
  }> {
    return this.resolveSafeModeConfig();
  }

  async previewEmailSafeMode(dto: EmailSafeModePreviewDto): Promise<{
    intendedRecipient: string;
    actualRecipient: string;
    redirected: boolean;
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
    headers: Record<string, string>;
  }> {
    const config = await this.resolveSafeModeConfig();
    const intendedRecipient = dto.intendedRecipient.trim().toLowerCase();
    const actualRecipient = config.enableExternalSend ? intendedRecipient : config.outboundRedirectTarget.toLowerCase();
    const redirected = actualRecipient !== intendedRecipient;
    const recipientDomain = actualRecipient.split('@')[1]?.toLowerCase() ?? '';

    if (!recipientDomain || !config.smtpAllowlistDomains.includes(recipientDomain)) {
      throw new BadRequestException(
        `Recipient domain "${recipientDomain || 'unknown'}" khong nam trong allowlist P1`
      );
    }

    const subject = redirected ? `[P1-DEMO -> ${intendedRecipient}] ${dto.subject.trim()}` : dto.subject.trim();
    const bannerText = `Day la email Phase 1 demo. Recipient goc: ${intendedRecipient}. Email nay duoc redirect tu dong ve ${actualRecipient}.`;
    const bodyText = dto.bodyText?.trim() ? `${bannerText}\n\n${dto.bodyText.trim()}` : bannerText;
    const bodyHtml = dto.bodyHtml?.trim()
      ? `<div style="background:#fff3cd;border:1px solid #ffe69c;padding:10px;margin-bottom:12px;font-family:Arial,sans-serif;font-size:13px;">${bannerText}</div>${dto.bodyHtml.trim()}`
      : null;

    return {
      intendedRecipient,
      actualRecipient,
      redirected,
      subject,
      bodyText,
      bodyHtml,
      headers: {
        'X-VN-Intended-Recipient': intendedRecipient,
        'X-VN-Phase': 'P1',
        'X-VN-Draft-Id': dto.draftId?.trim() || 'DRAFT-PREVIEW'
      }
    };
  }

  async handleTelegramWebhook(secret: string, payload: Record<string, unknown>): Promise<{ ok: boolean }> {
    const expected = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
    if (!expected || secret !== expected) {
      throw new BadRequestException('telegram webhook secret invalid');
    }

    const message = payload.message as Record<string, unknown> | undefined;
    const callback = payload.callback_query as Record<string, unknown> | undefined;

    if (message) {
      await this.handleTelegramMessage(message);
    }

    if (callback) {
      await this.handleTelegramCallback(callback);
    }

    return { ok: true };
  }

  private async handleTelegramMessage(message: Record<string, unknown>): Promise<void> {
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    const from = message.from as Record<string, unknown> | undefined;
    const chat = message.chat as Record<string, unknown> | undefined;
    const chatId = chat?.id ? String(chat.id) : '';
    const fromId = Number(from?.id ?? 0);

    if (!chatId || !fromId) {
      return;
    }

    if (!this.telegram.isAllowedUser(fromId)) {
      await this.telegram.sendText(chatId, 'Ban khong nam trong whitelist P1.');
      return;
    }

    if (text.startsWith('/prompt_show')) {
      const kind = text.split(' ')[1] === 'serialize' ? 'serialize' : 'compose';
      const prompt = await this.getPromptTemplate(kind);
      await this.telegram.sendText(chatId, `Prompt ${kind}:\n\n${prompt}`);
      return;
    }

    if (text.startsWith('/prompt_set')) {
      const match = text.match(/^\/prompt_set\s+(compose|serialize)\s+([\s\S]+)$/i);
      if (!match) {
        await this.telegram.sendText(chatId, 'Cu phap: /prompt_set compose|serialize <noi_dung>');
        return;
      }
      const kind = match[1].toLowerCase() as 'compose' | 'serialize';
      const value = match[2].trim();
      await this.upsertPromptTemplate(kind, value, String(fromId));
      await this.telegram.sendText(chatId, `Da cap nhat prompt ${kind}.`);
      return;
    }

    await this.telegram.sendText(
      chatId,
      'Lenh ho tro: /prompt_show compose|serialize, /prompt_set compose|serialize <text>'
    );
  }

  private async handleTelegramCallback(callback: Record<string, unknown>): Promise<void> {
    const callbackId = typeof callback.id === 'string' ? callback.id : '';
    const data = typeof callback.data === 'string' ? callback.data : '';
    const from = callback.from as Record<string, unknown> | undefined;
    const fromId = Number(from?.id ?? 0);

    if (!callbackId || !data || !fromId) {
      return;
    }

    if (!this.telegram.isAllowedUser(fromId)) {
      await this.telegram.answerCallbackQuery(callbackId, 'Khong co quyen');
      return;
    }

    const match = data.match(/^draft:(approve|reject):([a-f0-9-]{36})$/i);
    if (!match) {
      await this.telegram.answerCallbackQuery(callbackId, 'Action khong hop le');
      return;
    }

    const action = match[1].toLowerCase() as 'approve' | 'reject';
    const draftId = match[2];

    await this.reviewDraft(
      draftId,
      {
        action,
        rejectReason: action === 'reject' ? 'reject_from_telegram' : undefined
      },
      `tg:${fromId}`
    );

    await this.telegram.answerCallbackQuery(callbackId, `Draft ${action}d`);
  }

  private async enqueueDiscovery(searchJobId: string): Promise<void> {
    await this.discoveryQueue.add(
      'run-p1-discovery',
      { searchJobId },
      {
        jobId: `p1-discovery:${searchJobId}:${Date.now()}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    );
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

  private async enqueueEmailSend(draftId: string): Promise<void> {
    await this.emailSendQueue.add(
      'send-draft-email',
      { draftId },
      {
        jobId: `email-send:${draftId}:${Date.now()}`,
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

  private async loadReportSnapshots(searchJobId: string | null): Promise<ProspectRawSnapshot[]> {
    if (!searchJobId) {
      return [];
    }

    const rows = await this.pg.query<SnapshotForReportRow>(
      `SELECT source, entity_type, entity_id, raw_json
       FROM raw_data_snapshots
       WHERE job_id = $1
       ORDER BY created_at DESC
       LIMIT 40`,
      [searchJobId]
    );

    return rows.map((row) => ({
      source: row.source,
      entityType: row.entity_type,
      entityId: row.entity_id,
      rawJson: row.raw_json
    }));
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
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

  private async resolveSafeModeConfig(): Promise<SafeModeConfig> {
    const envFallback: SafeModeConfig = {
      enableExternalSend: this.parseBoolean(process.env.P1_ENABLE_EXTERNAL_SEND, false),
      outboundRedirectTarget: (process.env.P1_OUTBOUND_REDIRECT_TARGET ?? 'tandtnt18@gmail.com').trim().toLowerCase(),
      smtpAllowlistDomains: this.parseAllowlistDomains(process.env.P1_SMTP_ALLOWLIST_DOMAINS)
    };

    try {
      const rows = await this.pg.query<FeatureFlagRecord>(
        `SELECT key, value
         FROM feature_flags
         WHERE key = ANY($1::text[])`,
        [['enable_external_send', 'outbound_redirect_target', 'smtp_allowlist_domains']]
      );

      const flagMap = new Map(rows.map((row) => [row.key, row.value]));
      return {
        enableExternalSend: this.readBooleanFlag(flagMap.get('enable_external_send'), envFallback.enableExternalSend),
        outboundRedirectTarget: this.readStringFlag(
          flagMap.get('outbound_redirect_target'),
          envFallback.outboundRedirectTarget
        ),
        smtpAllowlistDomains: this.readDomainsFlag(
          flagMap.get('smtp_allowlist_domains'),
          envFallback.smtpAllowlistDomains
        )
      };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === '42P01') {
        return envFallback;
      }
      throw error;
    }
  }

  private async getPromptTemplate(kind: 'compose' | 'serialize'): Promise<string> {
    const fallback =
      kind === 'compose'
        ? 'Ban la Sales Assistant. Viet email outreach ngan gon, lich su, tieng Viet, co CTA 15-20 phut.'
        : 'Ban la Data Assistant. Chuan hoa va tra ve JSON hop le.';

    try {
      const rows = await this.pg.query<FeatureFlagRecord>(
        `SELECT key, value FROM feature_flags WHERE key = $1`,
        [`ai_prompt_${kind}`]
      );
      const value = rows[0]?.value;
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      return fallback;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === '42P01') {
        return fallback;
      }
      throw error;
    }
  }

  private async upsertPromptTemplate(kind: 'compose' | 'serialize', prompt: string, actor: string): Promise<void> {
    await this.pg.query(
      `INSERT INTO feature_flags (key, value, description, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_at = now()`,
      [`ai_prompt_${kind}`, JSON.stringify(prompt), `prompt updated by ${actor}`]
    );

    await this.writeAudit(actor, `prompt.${kind}.updated`, 'feature_flag', `ai_prompt_${kind}`, {
      length: prompt.length
    });
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
      return fallback;
    }
    return value.trim().toLowerCase() === 'true';
  }

  private parseAllowlistDomains(raw: string | undefined): string[] {
    const domains = (raw ?? 'gmail.com,vnetwork.vn')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return domains.length > 0 ? domains : ['gmail.com', 'vnetwork.vn'];
  }

  private readBooleanFlag(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    return fallback;
  }

  private readStringFlag(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().toLowerCase();
    }
    return fallback;
  }

  private readDomainsFlag(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value)) {
      const domains = value
        .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
        .filter(Boolean);
      if (domains.length > 0) {
        return domains;
      }
    }
    return fallback;
  }
}
