import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PgService } from '../database/pg.service';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import {
  CreateTemplateDto,
  CreateSearchJobDto,
  EmailSafeModePreviewDto,
  ListDraftsQueryDto,
  ReviewDraftDto
  ,
  ListTemplateCandidatesQueryDto,
  ListTemplatesQueryDto,
  UpdateTemplateDto
} from './p1.dto';
import { OpenAiClient, ProspectComposeInput, ProspectRawSnapshot, TemplateComposeInput } from '../integrations/openai.client';
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

interface DraftReviewContextRow {
  draft_id: string;
  subject: string;
  body_text: string;
  company: string | null;
  person_name: string | null;
  intended_recipient: string | null;
}

interface EmailHistoryRecord {
  id: string;
  draft_id: string;
  sender: string;
  intended_recipient: string;
  actual_recipient: string;
  redirected: boolean;
  subject: string;
  status: 'sent' | 'failed' | 'bounced' | 'delivered';
  sent_at: string | null;
  created_at: string;
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

interface EmailTemplateRecord {
  id: string;
  industry: string;
  subject_template: string;
  body_template: string;
  version: number;
}

interface TemplateCandidateRecord {
  id: string;
  draft_id: string;
  template_key: string;
  subject: string;
  body_text: string;
  normalized_body: string;
  similarity_score: string | null;
  promoted: boolean;
  created_at: string;
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
  provider: 'openai' | 'gemini' | 'fallback';
  source_count: number;
  confidence_score: string | null;
  industry_normalized: string | null;
  industry_confidence: string | null;
  generated_at: string;
  updated_at: string;
}

interface ProspectCompanyReportDbRow {
  id: string;
  prospect_id: string;
  company_name: string;
  report_json: Record<string, unknown>;
  generated_at: string;
}

interface ProspectCompanyReportListItem extends ProspectCompanyReportRecord {
  person_name: string | null;
  person_email: string | null;
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

interface ReportKeyPersonRow {
  person_name: string;
  person_title: string | null;
  person_email: string | null;
  person_phone: string | null;
  confidence: string | null;
  source: string;
}

interface SnapshotForReportRow {
  source: string;
  entity_type: string;
  entity_id: string | null;
  raw_json: unknown;
}

interface RawSnapshotRecord {
  id: string;
  job_id: string | null;
  source: string;
  entity_type: string;
  entity_id: string | null;
  raw_json: unknown;
  content_hash: string | null;
  created_at: string;
}

@Injectable()
export class P1Service {
  private readonly logger = new Logger(P1Service.name);

  constructor(
    private readonly pg: PgService,
    private readonly openAi: OpenAiClient,
    private readonly telegram: P1TelegramService,
    @InjectQueue('p1-sheets-sync') private readonly syncQueue: Queue,
    @InjectQueue('p1-discovery') private readonly discoveryQueue: Queue,
    @InjectQueue('p1-email-send') private readonly emailSendQueue: Queue,
    @InjectQueue('p1-telegram-snooze') private readonly snoozeQueue: Queue
  ) {}

  private readonly execFileAsync = promisify(execFile);

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

  async listRawSnapshots(
    searchJobId: string,
    query: {
      source?: string;
      entityType?: string;
      q?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<PagedResult<RawSnapshotRecord>> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const conditions: string[] = ['job_id = $1'];
    const params: unknown[] = [searchJobId];

    if (query.source?.trim()) {
      params.push(query.source.trim());
      conditions.push(`source = $${params.length}`);
    }

    if (query.entityType?.trim()) {
      params.push(query.entityType.trim());
      conditions.push(`entity_type = $${params.length}`);
    }

    if (query.q?.trim()) {
      params.push(`%${query.q.trim()}%`);
      conditions.push(
        `(COALESCE(entity_id, '') ILIKE $${params.length} OR COALESCE(raw_text, '') ILIKE $${params.length} OR COALESCE(raw_json::text, '') ILIKE $${params.length})`
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRows = await this.pg.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM raw_data_snapshots ${where}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<RawSnapshotRecord>(
      `SELECT id, job_id, source, entity_type, entity_id, raw_json, content_hash, created_at
       FROM raw_data_snapshots
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

  async listProspectReports(query: {
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<PagedResult<ProspectCompanyReportListItem>> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.q?.trim()) {
      params.push(`%${query.q.trim()}%`);
      conditions.push(
        `(r.company_name ILIKE $${params.length} OR COALESCE(p.person_name, '') ILIKE $${params.length} OR COALESCE(p.email, '') ILIKE $${params.length})`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.pg.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM prospect_company_reports r
       LEFT JOIN prospects p ON p.id = r.prospect_id
       ${where}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<ProspectCompanyReportListItem>(
      `SELECT
         r.*,
         p.person_name,
         p.email AS person_email
       FROM prospect_company_reports r
       LEFT JOIN prospects p ON p.id = r.prospect_id
       ${where}
       ORDER BY r.generated_at DESC
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

  async getProspectCompanyReportLatex(
    prospectId: string
  ): Promise<{ filename: string; contentType: 'application/x-tex'; content: string }> {
    const report = await this.getCompanyReportDbRow(prospectId);
    const latex = this.readReportLatex(report);
    return {
      filename: this.buildReportFilename(report.company_name, report.generated_at, 'tex'),
      contentType: 'application/x-tex',
      content: latex
    };
  }

  async getProspectCompanyReportPdf(
    prospectId: string
  ): Promise<{ filename: string; contentType: 'application/pdf'; contentBase64: string }> {
    const report = await this.getCompanyReportDbRow(prospectId);
    const latex = this.readReportLatex(report);
    const pdfBuffer = await this.compileLatexToPdf(latex);

    return {
      filename: this.buildReportFilename(report.company_name, report.generated_at, 'pdf'),
      contentType: 'application/pdf',
      contentBase64: pdfBuffer.toString('base64')
    };
  }

  async generateProspectCompanyReport(
    prospectId: string,
    actor: string,
    modelKind: 'fast' | 'balanced' | 'reasoning' = 'balanced'
  ): Promise<ProspectCompanyReportRecord> {
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
    const relatedKeyPersons = await this.loadReportKeyPersons(prospect.search_job_id, prospect.company_name);
    const promptTemplate = await this.getPromptTemplate('serialize');
    const confidenceValue =
      prospect.ai_confidence_score !== null && prospect.ai_confidence_score !== undefined
        ? Number(prospect.ai_confidence_score)
        : null;

    const report = await this.openAi.generateProspectCompanyReport({
      modelKind,
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
      relatedKeyPersons,
      snapshots
    });

    const latexSource = this.buildLatexReport(prospect.company_name, report.reportJson, report.provider, snapshots.length, report.confidenceScore);
    const enrichedReportJson: Record<string, unknown> = {
      ...report.reportJson,
      latex_source: latexSource,
      latex_generated_at: new Date().toISOString()
    };

    const savedRows = await this.saveProspectCompanyReport({
      prospectId: prospect.prospect_id,
      searchJobId: prospect.search_job_id,
      companyName: prospect.company_name,
      reportMarkdown: report.reportMarkdown,
      reportJson: enrichedReportJson,
      provider: report.provider,
      sourceCount: snapshots.length,
      confidenceScore: report.confidenceScore,
      industryNormalized: report.industryNormalized,
      industryConfidence: report.industryConfidence
    });

    const saved = savedRows[0];
    await this.writeAudit(actor, 'prospect.company_report.generated', 'prospect', prospect.prospect_id, {
      provider: saved.provider,
      modelKind,
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
    const rows = await this.pg.query<ProspectForDraft & { industry_normalized: string | null }>(
      `SELECT
         p.id AS prospect_id,
         p.company_id,
         p.company AS company_name,
         COALESCE(c.industry, p.industry) AS company_industry,
         p.person_name,
         p.position AS person_title,
         p.email AS person_email,
         r.industry_normalized
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       LEFT JOIN prospect_company_reports r ON r.prospect_id = p.id
       WHERE p.id = $1`,
      [prospectId]
    );

    const prospect = rows[0];
    if (!prospect) {
      throw new NotFoundException(`Prospect ${prospectId} not found`);
    }

    if (await this.isEmailSuppressed(prospect.person_email)) {
      throw new BadRequestException(`Email ${prospect.person_email} hiện đang nằm trong suppression list`);
    }

    const promptTemplate = await this.getPromptTemplate('compose');
    const composeInput: ProspectComposeInput = {
      companyName: prospect.company_name,
      companyIndustry: prospect.company_industry,
      personName: prospect.person_name,
      personTitle: prospect.person_title,
      personEmail: prospect.person_email
    };
    const sequence = await this.getProspectEmailSequence(prospect.prospect_id);
    const candidateKeys = this.buildTemplateKeyCandidates(
      prospect.person_title,
      sequence,
      prospect.industry_normalized,
      prospect.company_industry
    );

    let template: EmailTemplateRecord | null = null;
    let templateKey: string | null = candidateKeys[0] ?? null;
    let matchedKey: string | null = null;
    for (const candidate of candidateKeys) {
      const found = await this.getLatestTemplateByIndustry(candidate);
      if (found) {
        template = found;
        matchedKey = candidate;
        templateKey = candidate;
        break;
      }
    }
    if (matchedKey && matchedKey !== candidateKeys[0]) {
      this.logger.log(
        `Template fallback for prospect ${prospect.prospect_id}: ${candidateKeys[0]} -> ${matchedKey}`
      );
    }

    const forceSecuritiesTemplate = (process.env.P1_FORCE_SECURITIES_TEMPLATE ?? 'true').trim().toLowerCase() === 'true';

    if (forceSecuritiesTemplate && !template) {
      throw new BadRequestException(
        `Không tìm thấy email template active. Đã thử các key: ${candidateKeys.join(', ')}`
      );
    }

    const templateContext: TemplateComposeInput = {
      ...composeInput,
      step: sequence
    };

    const strictTemplateMode = (process.env.P1_TEMPLATE_STRICT_MODE ?? 'true').trim().toLowerCase() === 'true';

    const draft = template
      ? strictTemplateMode
        ? {
            subject: this.renderTemplateText(template.subject_template, composeInput),
            bodyText: this.renderTemplateText(template.body_template, composeInput),
            provider: 'fallback' as const
          }
        : await this.openAi.composeDraftFromTemplate({
            promptTemplate,
            context: templateContext,
            templateSubject: this.renderTemplateText(template.subject_template, composeInput),
            templateBody: this.renderTemplateText(template.body_template, composeInput)
          })
      : await this.openAi.composeDraftEmail({
          prospect: composeInput,
          promptTemplate
        });

    const created = await this.pg.query<{ id: string }>(
      `INSERT INTO drafts (
         prospect_id, company_id, scenario_id, template_id, channel, compose_mode, subject, body_text, status
       ) VALUES ($1, $2, $3, $4, 'email', $5, $6, $7, 'pending_review')
       RETURNING id`,
      [
        prospect.prospect_id,
        prospect.company_id,
        templateKey,
        template?.id ?? null,
        template ? 'from_template' : 'from_scratch',
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
      provider: draft.provider,
      templateKey,
      templateId: template?.id ?? null,
      sequence
    });

    const card = await this.telegram.sendDraftReviewCard({
      draftId,
      company: prospect.company_name,
      person: prospect.person_name,
      intendedRecipient: prospect.person_email ?? 'unknown@invalid.local',
      subject: draft.subject,
      bodyText: draft.bodyText
    });

    if (card) {
      await this.pg.query(
        `UPDATE drafts SET tg_review_chat_id=$2, tg_review_message_id=$3 WHERE id=$1`,
        [draftId, card.chatId, card.messageId]
      );
    }

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

  async listEmailHistory(query: {
    status?: 'sent' | 'failed' | 'bounced' | 'delivered';
    limit?: number;
    offset?: number;
  }): Promise<PagedResult<EmailHistoryRecord>> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.pg.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM email_history ${where}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const items = await this.pg.query<EmailHistoryRecord>(
      `SELECT id, draft_id, sender, intended_recipient, actual_recipient, redirected, subject, status, sent_at, created_at
       FROM email_history
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

    if (draft.status !== 'pending_review') {
      throw new BadRequestException(
        `Draft đang ở trạng thái "${draft.status}", không thể ${dto.action} (chỉ cho phép khi pending_review)`
      );
    }

    let newStatus: DraftRecord['status'] = draft.status;

    if (dto.action === 'approve') {
      newStatus = 'approved';
      await this.pg.query(
        `UPDATE drafts
         SET status='approved', approved_at=now(), approved_as_is = $2, snoozed_until = NULL
         WHERE id = $1`,
        [draftId, !dto.subject && !dto.bodyText]
      );
      await this.captureTemplateCandidateIfApprovedAsIs(draftId);
      await this.enqueueEmailSend(draftId);
      await this.invalidateActiveCard(draftId, '✅ Đã Approve và đẩy vào hàng đợi gửi email.');
    } else if (dto.action === 'reject') {
      newStatus = 'rejected';
      await this.pg.query(
        `UPDATE drafts
         SET status='rejected', reject_reason=$2, snoozed_until = NULL
         WHERE id = $1`,
        [draftId, dto.rejectReason?.trim() || 'rejected_by_reviewer']
      );
      await this.invalidateActiveCard(draftId, `❌ Draft bị reject. Lý do: ${dto.rejectReason ?? 'n/a'}`);
    } else {
      const subject = dto.subject?.trim() || draft.subject;
      const bodyText = dto.bodyText?.trim() || draft.body_text;
      newStatus = 'pending_review';
      await this.pg.query(
        `UPDATE drafts
         SET subject=$2, body_text=$3, edit_count=edit_count+1, status='pending_review', snoozed_until=NULL
         WHERE id = $1`,
        [draftId, subject, bodyText]
      );
      await this.invalidateActiveCard(draftId, '✏️ Draft đã được chỉnh sửa, card mới sẽ được gửi ngay.');
      const context = await this.getDraftReviewContext(draftId);
      const card = await this.telegram.sendDraftReviewCard({
        draftId,
        company: context?.company ?? 'N/A',
        person: context?.person_name ?? reviewer,
        intendedRecipient: context?.intended_recipient ?? 'unknown@invalid.local',
        subject,
        bodyText
      });
      if (card) {
        await this.pg.query(
          `UPDATE drafts SET tg_review_chat_id=$2, tg_review_message_id=$3 WHERE id=$1`,
          [draftId, card.chatId, card.messageId]
        );
      }
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

  private async invalidateActiveCard(draftId: string, banner: string): Promise<void> {
    const rows = await this.pg.query<{ tg_review_chat_id: string | null; tg_review_message_id: number | null }>(
      `SELECT tg_review_chat_id, tg_review_message_id FROM drafts WHERE id=$1`,
      [draftId]
    );
    const row = rows[0];
    if (!row?.tg_review_chat_id || !row?.tg_review_message_id) return;
    await this.telegram.appendBannerToText(row.tg_review_chat_id, Number(row.tg_review_message_id), banner);
    await this.pg.query(`UPDATE drafts SET tg_review_message_id=NULL WHERE id=$1`, [draftId]);
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
        `Recipient domain "${recipientDomain || 'unknown'}" không nằm trong allowlist P1`
      );
    }

    const subject = redirected ? `[P1-DEMO -> ${intendedRecipient}] ${dto.subject.trim()}` : dto.subject.trim();
    const bannerText = `Đây là email Phase 1 demo. Người nhận gốc: ${intendedRecipient}. Email này được redirect tự động về ${actualRecipient}.`;
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
    const replyTo = message.reply_to_message as Record<string, unknown> | undefined;

    if (!chatId || !fromId) {
      return;
    }

    if (!this.telegram.isAllowedUser(fromId)) {
      await this.telegram.sendText(chatId, 'Bạn không nằm trong whitelist P1.');
      return;
    }

    // Priority: if user is replying to a force-reply session prompt, route it through session
    if (replyTo) {
      const replyMessageId = Number(replyTo.message_id ?? 0);
      if (replyMessageId && (await this.routeReviewSessionReply(chatId, fromId, replyMessageId, text))) {
        return;
      }
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
        await this.telegram.sendText(chatId, 'Cú pháp: /prompt_set compose|serialize <nội_dung>');
        return;
      }
      const kind = match[1].toLowerCase() as 'compose' | 'serialize';
      const value = match[2].trim();
      await this.upsertPromptTemplate(kind, value, String(fromId));
      await this.telegram.sendText(chatId, `Đã cập nhật prompt ${kind}.`);
      return;
    }

    if (text.startsWith('/draft_show')) {
      const match = text.match(/^\/draft_show\s+([a-f0-9-]{36})$/i);
      if (!match) {
        await this.telegram.sendText(chatId, 'Cú pháp: /draft_show <draft_id>');
        return;
      }
      const context = await this.getDraftReviewContext(match[1]);
      if (!context) {
        await this.telegram.sendText(chatId, 'Không tìm thấy draft.');
        return;
      }
      await this.telegram.sendText(
        chatId,
        [
          `Draft: ${context.draft_id}`,
          `Company: ${context.company ?? 'N/A'}`,
          `Person: ${context.person_name ?? 'N/A'}`,
          `To: ${context.intended_recipient ?? 'N/A'}`,
          `Subject: ${context.subject}`,
          '',
          `Body:`,
          context.body_text
        ].join('\n')
      );
      return;
    }

    if (text.startsWith('/draft_edit')) {
      const lines = text.split('\n');
      const head = lines[0] ?? '';
      const draftIdMatch = head.match(/^\/draft_edit\s+([a-f0-9-]{36})$/i);
      if (!draftIdMatch) {
        await this.telegram.sendText(
          chatId,
          [
            'Cú pháp (gửi multi-line):',
            '/draft_edit <draft_id>',
            'Subject: <tiêu đề mới>',
            '---',
            '<nội dung mới>'
          ].join('\n')
        );
        return;
      }
      const draftId = draftIdMatch[1];
      const context = await this.getDraftReviewContext(draftId);
      if (!context) {
        await this.telegram.sendText(chatId, 'Không tìm thấy draft.');
        return;
      }

      const parsed = this.parseEditedDraftBody(lines.slice(1).join('\n'), context.subject);
      if (!parsed) {
        await this.telegram.sendText(
          chatId,
          [
            'Nội dung edit không hợp lệ. Dùng một trong hai cách:',
            '1) /draft_edit <id>',
            '   Subject: ...',
            '   ---',
            '   <body>',
            '2) /draft_edit <id>',
            '   <body mới>  (giữ nguyên subject cũ)'
          ].join('\n')
        );
        return;
      }

      try {
        await this.reviewDraft(
          draftId,
          { action: 'edit', subject: parsed.subject, bodyText: parsed.bodyText },
          `tg:${fromId}`
        );
        await this.telegram.sendText(chatId, `✏️ Đã cập nhật draft ${draftId} và gửi lại card review.`);
      } catch (error) {
        await this.telegram.sendText(chatId, `Edit thất bại: ${(error as Error).message}`);
      }
      return;
    }

    await this.telegram.sendText(
      chatId,
      'Lệnh hỗ trợ: /prompt_show compose|serialize, /prompt_set compose|serialize <text>, /draft_show <id>, /draft_edit <id>'
    );
  }

  private parseEditedDraftBody(content: string, currentSubject: string): { subject: string; bodyText: string } | null {
    const lines = content.split('\n');
    const sepIndex = lines.findIndex((line) => line.trim() === '---');
    const firstLine = (lines[0] ?? '').trim();
    const hasSubjectLine = /^Subject:\s*/i.test(firstLine);

    const subject = hasSubjectLine ? firstLine.replace(/^Subject:\s*/i, '').trim() : currentSubject;

    let bodyText = '';
    if (sepIndex >= 0) {
      bodyText = lines.slice(sepIndex + 1).join('\n').trim();
    } else if (hasSubjectLine) {
      bodyText = lines.slice(1).join('\n').trim();
    } else {
      bodyText = content.trim();
    }

    if (!subject || !bodyText) return null;
    return { subject, bodyText };
  }

  private async routeReviewSessionReply(
    chatId: string,
    fromId: number,
    replyMessageId: number,
    text: string
  ): Promise<boolean> {
    const rows = await this.pg.query<{
      id: string;
      draft_id: string;
      intent: 'edit' | 'reject_reason';
      tg_chat_id: string;
      tg_card_message_id: string | null;
      expires_at: string;
    }>(
      `SELECT id, draft_id, intent, tg_chat_id, tg_card_message_id::text, expires_at
       FROM telegram_review_sessions
       WHERE tg_prompt_message_id = $1 AND status = 'active'
       LIMIT 1`,
      [replyMessageId]
    );
    const session = rows[0];
    if (!session) return false;

    if (new Date(session.expires_at).getTime() < Date.now()) {
      await this.pg.query(
        `UPDATE telegram_review_sessions SET status='expired', completed_at=now() WHERE id=$1`,
        [session.id]
      );
      await this.telegram.sendText(chatId, '⏱ Phiên chỉnh sửa đã hết hạn (30 phút). Hãy bấm Edit/Reject lại trên card mới nhất.');
      return true;
    }

    if (text === '/cancel') {
      await this.pg.query(
        `UPDATE telegram_review_sessions SET status='cancelled', completed_at=now() WHERE id=$1`,
        [session.id]
      );
      await this.telegram.sendText(chatId, '↩ Đã hủy thao tác.');
      return true;
    }

    try {
      if (session.intent === 'edit') {
        const context = await this.getDraftReviewContext(session.draft_id);
        if (!context) {
          await this.telegram.sendText(chatId, 'Không tìm thấy draft.');
          return true;
        }
        const parsed = this.parseEditedDraftBody(text, context.subject);
        if (!parsed) {
          await this.telegram.sendText(
            chatId,
            'Nội dung edit không hợp lệ. Hãy tuân thủ format: dòng đầu "Subject: ...", rồi dòng "---", rồi body. Bấm Edit trên card để gửi lại mẫu.'
          );
          return true;
        }
        await this.reviewDraft(
          session.draft_id,
          { action: 'edit', subject: parsed.subject, bodyText: parsed.bodyText },
          `tg:${fromId}`
        );
        await this.telegram.sendText(chatId, '✅ Hoàn tất chỉnh sửa. Card review mới vừa được gửi bên trên.');
      } else {
        const reason = text === '/skip' ? 'rejected_via_telegram' : text.trim();
        await this.reviewDraft(
          session.draft_id,
          { action: 'reject', rejectReason: reason },
          `tg:${fromId}`
        );
        await this.telegram.sendText(chatId, `❌ Draft đã reject. Lý do ghi nhận: ${reason}`);
      }
      await this.pg.query(
        `UPDATE telegram_review_sessions SET status='completed', completed_at=now() WHERE id=$1`,
        [session.id]
      );
    } catch (error) {
      await this.telegram.sendText(chatId, `Thao tác thất bại: ${(error as Error).message}`);
      await this.pg.query(
        `UPDATE telegram_review_sessions SET status='failed', completed_at=now() WHERE id=$1`,
        [session.id]
      );
    }
    return true;
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
      await this.telegram.answerCallbackQuery(callbackId, 'Không có quyền');
      return;
    }

    const message = callback.message as Record<string, unknown> | undefined;
    const chat = message?.chat as Record<string, unknown> | undefined;
    const chatId = chat?.id ? String(chat.id) : '';
    const messageId = Number(message?.message_id ?? 0);

    const match = data.match(/^draft:(approve|reject|edit|show|snooze|approve_confirm|approve_cancel):([a-f0-9-]{36})$/i);
    if (!match) {
      await this.telegram.answerCallbackQuery(callbackId, 'Action không hợp lệ');
      return;
    }

    const action = match[1].toLowerCase() as
      | 'approve'
      | 'reject'
      | 'edit'
      | 'show'
      | 'snooze'
      | 'approve_confirm'
      | 'approve_cancel';
    const draftId = match[2];

    if (action === 'show') {
      if (chatId) {
        const context = await this.getDraftReviewContext(draftId);
        if (context) {
          await this.telegram.sendText(
            chatId,
            [
              `Draft: ${context.draft_id}`,
              `Công ty: ${context.company ?? 'N/A'}`,
              `Người nhận: ${context.person_name ?? 'N/A'}`,
              `Email đích: ${context.intended_recipient ?? 'N/A'}`,
              `Subject: ${context.subject}`,
              '',
              'Nội dung:',
              context.body_text
            ].join('\n')
          );
        }
      }
      await this.telegram.answerCallbackQuery(callbackId, 'Đã gửi full draft');
      return;
    }

    if (!(await this.assertDraftPending(draftId, callbackId))) return;

    if (action === 'edit') {
      if (!chatId) {
        await this.telegram.answerCallbackQuery(callbackId, 'Không xác định được chat');
        return;
      }
      const context = await this.getDraftReviewContext(draftId);
      if (!context) {
        await this.telegram.answerCallbackQuery(callbackId, 'Không tìm thấy draft');
        return;
      }
      const promptText = [
        `✏️ Chỉnh sửa draft ${draftId}`,
        '',
        'Reply tin nhắn này với nội dung mới theo đúng format dưới (giữ nguyên dòng "---"):',
        '',
        'Subject: <tiêu đề mới>',
        '---',
        '<nội dung body mới>',
        '',
        '— Nội dung hiện tại —',
        `Subject: ${context.subject}`,
        '---',
        context.body_text,
        '',
        '(Bấm Reply, sửa tiếp, rồi gửi để hoàn tất. Gửi /cancel để hủy.)'
      ].join('\n');
      const promptMessageId = await this.telegram.sendForceReplyPrompt(
        chatId,
        promptText,
        'Subject: ... | --- | <body>'
      );
      if (!promptMessageId) {
        await this.telegram.answerCallbackQuery(callbackId, 'Không gửi được prompt edit');
        return;
      }
      await this.openReviewSession({
        draftId,
        chatId,
        cardMessageId: messageId,
        promptMessageId,
        intent: 'edit',
        createdBy: `tg:${fromId}`
      });
      await this.telegram.answerCallbackQuery(callbackId, 'Hãy reply tin nhắn vừa gửi');
      return;
    }

    if (action === 'reject') {
      if (!chatId) {
        await this.telegram.answerCallbackQuery(callbackId, 'Không xác định được chat');
        return;
      }
      const promptText = [
        `❌ Reject draft ${draftId}`,
        '',
        'Reply tin nhắn này với LÝ DO reject (tối thiểu 1 dòng).',
        'Hoặc gửi /skip để reject với lý do mặc định.'
      ].join('\n');
      const promptMessageId = await this.telegram.sendForceReplyPrompt(chatId, promptText, 'Lý do reject');
      if (!promptMessageId) {
        await this.telegram.answerCallbackQuery(callbackId, 'Không gửi được prompt');
        return;
      }
      await this.openReviewSession({
        draftId,
        chatId,
        cardMessageId: messageId,
        promptMessageId,
        intent: 'reject_reason',
        createdBy: `tg:${fromId}`
      });
      await this.telegram.answerCallbackQuery(callbackId, 'Hãy reply lý do reject');
      return;
    }

    if (action === 'approve') {
      const context = await this.getDraftReviewContext(draftId);
      if (!context) {
        await this.telegram.answerCallbackQuery(callbackId, 'Không tìm thấy draft');
        return;
      }
      await this.telegram.sendApproveConfirmCard({
        draftId,
        intendedRecipient: context.intended_recipient ?? 'unknown@invalid.local',
        subject: context.subject
      });
      await this.telegram.answerCallbackQuery(callbackId, 'Hãy xác nhận ở card mới');
      return;
    }

    if (action === 'approve_cancel') {
      if (chatId && messageId) {
        await this.telegram.appendBannerToText(chatId, messageId, '↩ Đã hủy thao tác approve, draft vẫn pending.');
      }
      await this.telegram.answerCallbackQuery(callbackId, 'Đã hủy');
      return;
    }

    if (action === 'approve_confirm') {
      if (chatId && messageId) {
        await this.telegram.clearInlineKeyboard(chatId, messageId);
      }
      await this.reviewDraft(draftId, { action: 'approve' }, `tg:${fromId}`);
      await this.telegram.answerCallbackQuery(callbackId, 'Đã approve và đẩy vào queue');
      return;
    }

    if (action === 'snooze') {
      await this.snoozeDraft(draftId, 3600 * 1000, `tg:${fromId}`);
      if (chatId && messageId) {
        await this.telegram.appendBannerToText(
          chatId,
          messageId,
          '⏰ Đã snooze 1 giờ. Card mới sẽ được gửi lại sau khi đến hạn.'
        );
      }
      await this.pg.query(`UPDATE drafts SET tg_review_message_id=NULL WHERE id=$1`, [draftId]);
      await this.telegram.answerCallbackQuery(callbackId, 'Đã snooze 1 giờ');
      return;
    }

    await this.telegram.answerCallbackQuery(callbackId, 'Action chưa được xử lý');
  }

  private async assertDraftPending(draftId: string, callbackId: string): Promise<boolean> {
    const rows = await this.pg.query<{ status: string }>(`SELECT status FROM drafts WHERE id=$1`, [draftId]);
    const status = rows[0]?.status;
    if (!status) {
      await this.telegram.answerCallbackQuery(callbackId, 'Draft không tồn tại');
      return false;
    }
    if (status !== 'pending_review') {
      await this.telegram.answerCallbackQuery(callbackId, `Draft đang "${status}", không thể thao tác`, true);
      return false;
    }
    return true;
  }

  private async openReviewSession(input: {
    draftId: string;
    chatId: string;
    cardMessageId: number | null;
    promptMessageId: number;
    intent: 'edit' | 'reject_reason';
    createdBy: string;
  }): Promise<void> {
    // Invalidate any other active session for this draft
    await this.pg.query(
      `UPDATE telegram_review_sessions
       SET status='cancelled', completed_at=now()
       WHERE draft_id=$1 AND status='active'`,
      [input.draftId]
    );
    await this.pg.query(
      `INSERT INTO telegram_review_sessions (
         draft_id, tg_chat_id, tg_card_message_id, tg_prompt_message_id, intent, created_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '30 minutes')`,
      [
        input.draftId,
        input.chatId,
        input.cardMessageId || null,
        input.promptMessageId,
        input.intent,
        input.createdBy
      ]
    );
  }

  private async snoozeDraft(draftId: string, delayMs: number, actor: string): Promise<void> {
    const until = new Date(Date.now() + delayMs).toISOString();
    await this.pg.query(`UPDATE drafts SET snoozed_until=$2 WHERE id=$1`, [draftId, until]);
    await this.snoozeQueue.add(
      'fire-draft-snooze',
      { draftId },
      {
        jobId: `snooze:${draftId}:${Date.now()}`,
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    );
    await this.writeAudit(actor, 'draft.snooze.created', 'draft', draftId, { until, delayMs });
  }

  private async getDraftReviewContext(draftId: string): Promise<DraftReviewContextRow | null> {
    const rows = await this.pg.query<DraftReviewContextRow>(
      `SELECT
         d.id AS draft_id,
         d.subject,
         d.body_text,
         p.company,
         p.person_name,
         p.email AS intended_recipient
       FROM drafts d
       LEFT JOIN prospects p ON p.id = d.prospect_id
       WHERE d.id = $1
       LIMIT 1`,
      [draftId]
    );
    return rows[0] ?? null;
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

  private async loadReportKeyPersons(
    searchJobId: string | null,
    companyName: string
  ): Promise<
    Array<{
      name: string;
      title: string | null;
      email: string | null;
      phone: string | null;
      confidence: number | null;
      source: string;
    }>
  > {
    if (!searchJobId) {
      return [];
    }

    const rows = await this.pg.query<ReportKeyPersonRow>(
      `SELECT person_name, position AS person_title, email AS person_email, phone AS person_phone, confidence::text AS confidence, source
       FROM prospects
       WHERE search_job_id = $1
         AND lower(company) = lower($2)
       ORDER BY
         CASE WHEN email IS NULL OR trim(email) = '' THEN 1 ELSE 0 END ASC,
         COALESCE(confidence, 0) DESC,
         created_at ASC`,
      [searchJobId, companyName]
    );

    return rows.map((row) => {
      const confidenceValue = row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null;
      return {
        name: row.person_name,
        title: row.person_title,
        email: row.person_email,
        phone: row.person_phone,
        confidence: confidenceValue !== null && Number.isFinite(confidenceValue) ? confidenceValue : null,
        source: row.source
      };
    });
  }

  private async getCompanyReportDbRow(prospectId: string): Promise<ProspectCompanyReportDbRow> {
    const rows = await this.pg.query<ProspectCompanyReportDbRow>(
      `SELECT id, prospect_id, company_name, report_json, generated_at
       FROM prospect_company_reports
       WHERE prospect_id = $1
       LIMIT 1`,
      [prospectId]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Company report for prospect ${prospectId} not found`);
    }
    return rows[0];
  }

  private async saveProspectCompanyReport(input: {
    prospectId: string;
    searchJobId: string | null;
    companyName: string;
    reportMarkdown: string;
    reportJson: Record<string, unknown>;
    provider: string;
    sourceCount: number;
    confidenceScore: number | null;
    industryNormalized: string | null;
    industryConfidence: number | null;
  }): Promise<ProspectCompanyReportRecord[]> {
    const commonParams = [
      input.prospectId,
      input.searchJobId,
      input.companyName,
      input.reportMarkdown,
      JSON.stringify(input.reportJson),
      input.provider,
      input.sourceCount,
      input.confidenceScore
    ];

    try {
      return await this.pg.query<ProspectCompanyReportRecord>(
        `INSERT INTO prospect_company_reports (
           prospect_id, search_job_id, company_name, report_markdown, report_json, provider, source_count, confidence_score,
           industry_normalized, industry_confidence, generated_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, now())
         ON CONFLICT (prospect_id) DO UPDATE
         SET
           search_job_id = EXCLUDED.search_job_id,
           company_name = EXCLUDED.company_name,
           report_markdown = EXCLUDED.report_markdown,
           report_json = EXCLUDED.report_json,
           provider = EXCLUDED.provider,
           source_count = EXCLUDED.source_count,
           confidence_score = EXCLUDED.confidence_score,
           industry_normalized = EXCLUDED.industry_normalized,
           industry_confidence = EXCLUDED.industry_confidence,
           generated_at = EXCLUDED.generated_at,
           updated_at = now()
         RETURNING *`,
        [...commonParams, input.industryNormalized, input.industryConfidence]
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== '42703') {
        throw error;
      }

      // Backward-compatible fallback for environments missing migration 0011.
      return this.pg.query<ProspectCompanyReportRecord>(
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
        commonParams
      );
    }
  }

  private readReportLatex(report: ProspectCompanyReportDbRow): string {
    const json = report.report_json as Record<string, unknown>;
    const latex = json?.latex_source;
    if (typeof latex === 'string' && latex.trim().length > 0) {
      return latex;
    }
    return this.buildLatexReport(report.company_name, json, 'fallback', 0, null);
  }

  private buildReportFilename(companyName: string, generatedAt: string, ext: 'tex' | 'pdf'): string {
    const safeName = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company-report';
    const ts = new Date(generatedAt).toISOString().replace(/[:.]/g, '-');
    return `${safeName}-${ts}.${ext}`;
  }

  private buildLatexReport(
    companyName: string,
    reportJson: Record<string, unknown>,
    provider: string,
    sourceCount: number,
    confidenceScore: number | null
  ): string {
    const obj = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const str = (value: unknown): string => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'N/A');
    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
    const esc = (input: string): string =>
      input
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/([{}$&#_%])/g, '\\$1')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/~/g, '\\textasciitilde{}');

    const company = obj(reportJson.company_overview);
    const keyPerson = obj(reportJson.key_person);
    const firmographics = obj(reportJson.firmographics);
    const allKeyPersonsRaw = Array.isArray(reportJson.all_key_persons) ? reportJson.all_key_persons : [];
    const outreachHooksRaw = Array.isArray(reportJson.outreach_hooks) ? reportJson.outreach_hooks : [];
    const sourcesRaw = Array.isArray(reportJson.sources) ? reportJson.sources : [];

    const bullet = (items: string[]): string =>
      items.length ? items.map((item) => `\\item ${esc(item)}`).join('\n') : '\\item N/A';

    const allKeyPersonsTableRows =
      allKeyPersonsRaw.length === 0
        ? '\\textit{N/A} \\\\'
        : allKeyPersonsRaw
            .map((item) => obj(item))
            .map(
              (row) =>
                `${esc(str(row.name))} & ${esc(str(row.title))} & ${esc(str(row.email))} & ${esc(str(row.phone))} & ${esc(
                  typeof row.confidence_0_1 === 'number' ? Number(row.confidence_0_1).toFixed(2) : 'N/A'
                )} & ${esc(str(row.source))} \\\\`
            )
            .join('\n');

    const outreachHooksItems =
      outreachHooksRaw.length === 0
        ? '\\item N/A'
        : outreachHooksRaw
            .map((item) => obj(item))
            .map((row) => {
              const hook = esc(str(row.hook));
              const useIn = esc(str(row.use_in));
              const evidence = typeof row.evidence_url === 'string' && row.evidence_url ? ` — nguồn: ${esc(row.evidence_url)}` : '';
              return `\\item [${useIn}] ${hook}${evidence}`;
            })
            .join('\n');

    const sourcesItems =
      sourcesRaw.length === 0
        ? '\\item N/A'
        : sourcesRaw
            .map((item) => obj(item))
            .map((row) => {
              const url = esc(str(row.url));
              const title = typeof row.title === 'string' && row.title ? `${esc(row.title)} — ` : '';
              const claim = typeof row.claim_supported === 'string' && row.claim_supported ? ` (dẫn chứng cho: ${esc(row.claim_supported)})` : '';
              return `\\item ${title}${url}${claim}`;
            })
            .join('\n');

    const industryNormalized = str(reportJson.industry_normalized);
    const industryConfidence =
      typeof reportJson.industry_confidence === 'number'
        ? (reportJson.industry_confidence as number).toFixed(2)
        : 'N/A';

    return `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T5]{fontenc}
\\usepackage[vietnamese,english]{babel}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{array}
\\usepackage{booktabs}
\\geometry{margin=18mm}
\\setlength{\\parskip}{0.4em}
\\setlength{\\parindent}{0pt}
\\begin{document}
\\selectlanguage{vietnamese}
\\section*{Báo cáo tổng hợp công ty: ${esc(companyName)}}
Nhà cung cấp AI: ${esc(provider)} \\quad Số nguồn: ${esc(String(sourceCount))} \\quad Điểm: ${esc(
      confidenceScore === null ? 'N/A' : String(confidenceScore)
    )}

\\subsection*{Tóm tắt điều hành}
${esc(str(reportJson.executive_summary))}

\\subsection*{Tổng quan công ty}
\\begin{itemize}
\\item Tên miền: ${esc(str(company.domain))}
\\item Ngành: ${esc(str(company.industry))}
\\item Khu vực: ${esc(str(company.region))}
\\item Mô tả ngắn: ${esc(str(company.summary))}
\\item Phân loại ngành chuẩn hóa: ${esc(industryNormalized)} (độ tin cậy ${esc(industryConfidence)})
\\end{itemize}

\\subsection*{Firmographics}
\\begin{itemize}
\\item Quy mô nhân sự: ${esc(str(firmographics.employee_count_range))}
\\item Doanh thu (USD): ${esc(str(firmographics.revenue_range_usd))}
\\item Giai đoạn vốn: ${esc(str(firmographics.funding_stage))}
\\item Năm thành lập: ${esc(typeof firmographics.founded_year === 'number' ? String(firmographics.founded_year) : 'N/A')}
\\end{itemize}

\\subsection*{Người liên hệ chính}
\\begin{itemize}
\\item Họ tên: ${esc(str(keyPerson.name))}
\\item Chức danh: ${esc(str(keyPerson.title))}
\\item Email: ${esc(str(keyPerson.email))}
\\item Điện thoại: ${esc(str(keyPerson.phone))}
\\item LinkedIn: ${esc(str(keyPerson.linkedin))}
\\end{itemize}

\\subsection*{Outreach Hooks}
\\begin{itemize}
${outreachHooksItems}
\\end{itemize}

\\subsection*{Toàn bộ người liên hệ}
\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.18\\textwidth} >{\\raggedright\\arraybackslash}p{0.24\\textwidth} >{\\raggedright\\arraybackslash}p{0.2\\textwidth} >{\\raggedright\\arraybackslash}p{0.12\\textwidth} >{\\raggedright\\arraybackslash}p{0.08\\textwidth} >{\\raggedright\\arraybackslash}p{0.12\\textwidth}}
\\toprule
Họ tên & Chức danh & Email & Điện thoại & Độ tin cậy & Nguồn \\\\
\\midrule
${allKeyPersonsTableRows}
\\bottomrule
\\end{longtable}

\\subsection*{Tín hiệu mua hàng}
\\begin{itemize}
${bullet(list(reportJson.buying_signals))}
\\end{itemize}

\\subsection*{Rủi ro}
\\begin{itemize}
${bullet(list(reportJson.risks))}
\\end{itemize}

\\subsection*{Bước tiếp theo đề xuất}
\\begin{itemize}
${bullet(list(reportJson.recommended_next_steps))}
\\end{itemize}

\\subsection*{Nguồn dẫn chứng}
\\begin{itemize}
${sourcesItems}
\\end{itemize}

\\subsection*{Ghi chú chất lượng dữ liệu}
\\begin{itemize}
${bullet(list(reportJson.data_quality_notes))}
\\end{itemize}
\\end{document}
`;
  }

  private async compileLatexToPdf(latexSource: string): Promise<Buffer> {
    const tmpBase = await mkdtemp(join(tmpdir(), 'vnetwork-report-'));
    const texPath = join(tmpBase, 'report.tex');
    const pdfPath = join(tmpBase, 'report.pdf');

    try {
      await writeFile(texPath, latexSource, 'utf8');
      try {
        await this.execFileAsync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'report.tex'], {
          cwd: tmpBase,
          timeout: 120000,
          maxBuffer: 8 * 1024 * 1024
        });
      } catch {
        throw new BadRequestException('Server chưa có LaTeX engine (pdflatex) hoặc compile lỗi. Hãy tải file .tex để build PDF offline.');
      }

      return await readFile(pdfPath);
    } finally {
      await rm(tmpBase, { recursive: true, force: true });
    }
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
        ? 'Bạn là Sales Assistant. Viết email outreach ngắn gọn, lịch sự, toàn bộ bằng tiếng Việt có dấu, kèm CTA mời trao đổi 15-20 phút.'
        : 'Bạn là Data Assistant. Chuẩn hóa thông tin prospect và trả về JSON hợp lệ. Mọi nội dung văn xuôi viết bằng tiếng Việt có dấu.';

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

  async listTemplates(query: ListTemplatesQueryDto): Promise<PagedResult<EmailTemplateRecord>> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.q?.trim()) {
      params.push(`%${query.q.trim()}%`);
      conditions.push(`industry ILIKE $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await this.pg.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM email_templates ${where}`, params);
    params.push(limit, offset);
    const items = await this.pg.query<EmailTemplateRecord>(
      `SELECT id, industry, subject_template, body_template, version
       FROM email_templates
       ${where}
       ORDER BY updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { items, total: count[0]?.total ?? 0, limit, offset };
  }

  async createTemplate(dto: CreateTemplateDto, actor: string): Promise<EmailTemplateRecord> {
    const latest = await this.pg.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0)::int AS version FROM email_templates WHERE industry = $1`,
      [dto.industry.trim()]
    );
    const version = (latest[0]?.version ?? 0) + 1;
    const rows = await this.pg.query<EmailTemplateRecord>(
      `INSERT INTO email_templates (industry, subject_template, body_template, status, version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, industry, subject_template, body_template, version`,
      [dto.industry.trim(), dto.subjectTemplate.trim(), dto.bodyTemplate.trim(), dto.status ?? 'active', version]
    );
    await this.writeAudit(actor, 'template.created', 'email_template', rows[0].id, { industry: rows[0].industry, version });
    return rows[0];
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, actor: string): Promise<EmailTemplateRecord> {
    const rows = await this.pg.query<EmailTemplateRecord>(
      `UPDATE email_templates
       SET industry = COALESCE($2, industry),
           subject_template = COALESCE($3, subject_template),
           body_template = COALESCE($4, body_template),
           status = COALESCE($5, status),
           updated_at = now()
       WHERE id = $1
       RETURNING id, industry, subject_template, body_template, version`,
      [id, dto.industry?.trim() ?? null, dto.subjectTemplate?.trim() ?? null, dto.bodyTemplate?.trim() ?? null, dto.status ?? null]
    );
    if (!rows[0]) throw new NotFoundException(`Template ${id} not found`);
    await this.writeAudit(actor, 'template.updated', 'email_template', id, {});
    return rows[0];
  }

  async listTemplateCandidates(query: ListTemplateCandidatesQueryDto): Promise<PagedResult<TemplateCandidateRecord>> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (query.templateKey?.trim()) {
      params.push(query.templateKey.trim());
      conditions.push(`template_key = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await this.pg.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM template_candidates ${where}`,
      params
    );
    params.push(limit, offset);
    const items = await this.pg.query<TemplateCandidateRecord>(
      `SELECT id, draft_id, template_key, subject, body_text, normalized_body, similarity_score::text, promoted, created_at
       FROM template_candidates ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { items, total: count[0]?.total ?? 0, limit, offset };
  }

  async runTemplateLearningPromote(actor: string): Promise<{ promoted: number }> {
    const keys = await this.pg.query<{ template_key: string }>(
      `SELECT template_key
       FROM template_candidates
       WHERE promoted = false
         AND created_at >= now() - interval '30 days'
       GROUP BY template_key
       HAVING COUNT(*) >= 3`
    );

    let promoted = 0;
    for (const row of keys) {
      const candidates = await this.pg.query<TemplateCandidateRecord>(
        `SELECT id, draft_id, template_key, subject, body_text, normalized_body, similarity_score::text, promoted, created_at
         FROM template_candidates
         WHERE promoted = false
           AND template_key = $1
           AND created_at >= now() - interval '30 days'
         ORDER BY created_at DESC
         LIMIT 10`,
        [row.template_key]
      );
      if (candidates.length < 3) continue;
      const base = candidates[0];
      const sims = candidates.slice(1, 3).map((item) => this.computeTextSimilarity(base.normalized_body, item.normalized_body));
      const minSim = Math.min(...sims);
      if (minSim < 0.85) continue;

      const latest = await this.pg.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 0)::int AS version FROM email_templates WHERE industry = $1`,
        [row.template_key]
      );
      const version = (latest[0]?.version ?? 0) + 1;
      const created = await this.pg.query<{ id: string }>(
        `INSERT INTO email_templates (industry, subject_template, body_template, status, version)
         VALUES ($1, $2, $3, 'draft', $4)
         RETURNING id`,
        [row.template_key, base.subject, base.body_text, version]
      );
      const templateId = created[0].id;
      await this.pg.query(
        `UPDATE template_candidates
         SET promoted = true, promoted_template_id = $2, promoted_at = now(), similarity_score = $3
         WHERE template_key = $1
           AND promoted = false
           AND created_at >= now() - interval '30 days'`,
        [row.template_key, templateId, minSim]
      );
      promoted += 1;
      await this.writeAudit(actor, 'template_learning.promoted', 'email_template', templateId, {
        templateKey: row.template_key,
        minSimilarity: minSim
      });
    }

    return { promoted };
  }

  private async captureTemplateCandidateIfApprovedAsIs(draftId: string): Promise<void> {
    const rows = await this.pg.query<{
      draft_id: string;
      scenario_id: string | null;
      subject: string;
      body_text: string;
      approved_as_is: boolean;
    }>(
      `SELECT id AS draft_id, scenario_id, subject, body_text, approved_as_is
       FROM drafts
       WHERE id = $1`,
      [draftId]
    );
    const draft = rows[0];
    if (!draft || !draft.approved_as_is) return;
    const templateKey = (draft.scenario_id ?? '').trim();
    if (!templateKey) return;
    const normalized = this.normalizeBodyForSimilarity(draft.body_text);
    await this.pg.query(
      `INSERT INTO template_candidates (draft_id, template_key, industry, role_level, subject, body_text, normalized_body)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (draft_id) DO NOTHING`,
      [draft.draft_id, templateKey, templateKey, null, draft.subject, draft.body_text, normalized]
    );
  }

  private normalizeBodyForSimilarity(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private computeTextSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(' ').filter(Boolean));
    const setB = new Set(b.split(' ').filter(Boolean));
    if (!setA.size || !setB.size) return 0;
    let inter = 0;
    for (const token of setA) {
      if (setB.has(token)) inter += 1;
    }
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? inter / union : 0;
  }

  private async getProspectEmailSequence(prospectId: string): Promise<number> {
    const rows = await this.pg.query<{ total_sent: number }>(
      `SELECT COUNT(*)::int AS total_sent
       FROM email_history eh
       INNER JOIN drafts d ON d.id = eh.draft_id
       WHERE d.prospect_id = $1
         AND eh.status IN ('sent', 'delivered')`,
      [prospectId]
    );

    const sentCount = rows[0]?.total_sent ?? 0;
    const nextStep = sentCount + 1;
    return Math.min(Math.max(nextStep, 1), 3);
  }

  private buildTemplateKeyCandidates(
    personTitle: string | null,
    step: number,
    industryNormalized: string | null,
    companyIndustry: string | null
  ): string[] {
    const forceSecuritiesTemplate = (process.env.P1_FORCE_SECURITIES_TEMPLATE ?? 'true').trim().toLowerCase() === 'true';

    let industryKey = (industryNormalized ?? '').trim().toLowerCase() || null;
    if (!industryKey && this.isSecuritiesIndustry(companyIndustry)) {
      industryKey = 'securities';
    }
    if (!industryKey && forceSecuritiesTemplate) {
      industryKey = 'securities';
    }
    if (!industryKey) {
      return [];
    }

    const role = (personTitle ?? '').toLowerCase();
    const isTech =
      role.includes('cto') ||
      role.includes('it') ||
      role.includes('security') ||
      role.includes('hạ tầng') ||
      role.includes('ha tang') ||
      role.includes('infrastructure');
    const persona = isTech ? 'cto' : 'ceo';
    const otherPersona = persona === 'cto' ? 'ceo' : 'cto';
    const fallbackIndustry = (process.env.P1_TEMPLATE_FALLBACK_INDUSTRY ?? 'securities')
      .trim()
      .toLowerCase() || 'securities';

    // Priority order:
    //   1. exact match: <industry>_<persona>_followup_<step>
    //   2. exact match: <industry>_<otherPersona>_followup_<step>
    //   3. fallback industry, same persona
    //   4. fallback industry, other persona
    const candidates = [
      `${industryKey}_${persona}_followup_${step}`,
      `${industryKey}_${otherPersona}_followup_${step}`,
      `${fallbackIndustry}_${persona}_followup_${step}`,
      `${fallbackIndustry}_${otherPersona}_followup_${step}`
    ];

    // Deduplicate while preserving order
    return Array.from(new Set(candidates));
  }

  private async isEmailSuppressed(email: string | null): Promise<boolean> {
    if (!email) return false;
    try {
      const rows = await this.pg.query<{ email: string }>(
        `SELECT email FROM email_suppression
         WHERE email = $1
           AND (suppressed_until IS NULL OR suppressed_until > now())
         LIMIT 1`,
        [email.toLowerCase()]
      );
      return rows.length > 0;
    } catch (error) {
      if ((error as { code?: string })?.code === '42P01') return false;
      throw error;
    }
  }

  private isSecuritiesIndustry(industry: string | null): boolean {
    const text = (industry ?? '').trim().toLowerCase();
    if (!text) return false;
    return (
      text.includes('chứng khoán') ||
      text.includes('chung khoan') ||
      text.includes('securities') ||
      text.includes('brokerage') ||
      text.includes('finance') ||
      text.includes('financial')
    );
  }

  private async getLatestTemplateByIndustry(industry: string): Promise<EmailTemplateRecord | null> {
    const rows = await this.pg.query<EmailTemplateRecord>(
      `SELECT id, industry, subject_template, body_template, version
       FROM email_templates
       WHERE industry = $1 AND status = 'active'
       ORDER BY version DESC
       LIMIT 1`,
      [industry]
    );
    return rows[0] ?? null;
  }

  private renderTemplateText(template: string, prospect: ProspectComposeInput): string {
    const senderName = 'Ngoc Y';
    const senderCompany = 'VNETWORK';
    const recipientName = prospect.personName || 'Anh/Chị';
    const map: Record<string, string> = {
      '{{company_name}}': prospect.companyName || '[Company]',
      '{{recipient_name}}': recipientName,
      '{{person_name}}': recipientName,
      '{{person_title}}': prospect.personTitle || 'Anh/Chị',
      '{{person_email}}': prospect.personEmail || '',
      '{{sender_name}}': senderName,
      '{{sender_company}}': senderCompany
    };

    let output = template;
    for (const [key, value] of Object.entries(map)) {
      output = output.split(key).join(value);
    }
    return output;
  }
}
