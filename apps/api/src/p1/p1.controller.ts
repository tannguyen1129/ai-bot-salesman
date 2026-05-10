import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateSearchJobDto,
  DraftIdParamDto,
  EmailSafeModePreviewDto,
  ListDraftsQueryDto,
  ListEmailHistoryQueryDto,
  ListProspectReportsQueryDto,
  ListProspectsQueryDto,
  ListRawSnapshotsQueryDto,
  ListSearchJobsQueryDto,
  ListTemplateCandidatesQueryDto,
  ListTemplatesQueryDto,
  ProspectIdParamDto,
  GenerateProspectReportDto,
  ReviewDraftDto,
  SearchJobIdParamDto,
  TemplateIdParamDto,
  TelegramWebhookQueryDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  UpdateProspectStatusDto
} from './p1.dto';
import { P1Service } from './p1.service';

@Controller('p1')
export class P1Controller {
  constructor(private readonly p1Service: P1Service) {}

  @Post('search-jobs')
  async createSearchJob(@Body() dto: CreateSearchJobDto) {
    return this.p1Service.createSearchJob(dto);
  }

  @Get('search-jobs')
  async listSearchJobs(@Query() query: ListSearchJobsQueryDto) {
    return this.p1Service.listSearchJobs(query);
  }

  @Get('search-jobs/:id')
  async getSearchJobById(@Param() params: SearchJobIdParamDto) {
    return this.p1Service.getSearchJobById(params.id);
  }

  @Post('search-jobs/:id/retry')
  async retrySearchJob(@Param() params: SearchJobIdParamDto) {
    return this.p1Service.retrySearchJob(params.id, 'sales-operator');
  }

  @Get('search-jobs/:id/raw-snapshots')
  async listRawSnapshots(@Param() params: SearchJobIdParamDto, @Query() query: ListRawSnapshotsQueryDto) {
    return this.p1Service.listRawSnapshots(params.id, query);
  }

  @Get('prospects')
  async listProspects(@Query() query: ListProspectsQueryDto) {
    return this.p1Service.listProspects(query);
  }

  @Get('reports')
  async listProspectReports(@Query() query: ListProspectReportsQueryDto) {
    return this.p1Service.listProspectReports(query);
  }

  @Get('prospects/:id/report')
  async getProspectCompanyReport(@Param() params: ProspectIdParamDto) {
    return this.p1Service.getProspectCompanyReport(params.id);
  }

  @Get('prospects/:id/report/latex')
  async getProspectCompanyReportLatex(@Param() params: ProspectIdParamDto) {
    return this.p1Service.getProspectCompanyReportLatex(params.id);
  }

  @Get('prospects/:id/report/pdf')
  async getProspectCompanyReportPdf(@Param() params: ProspectIdParamDto) {
    return this.p1Service.getProspectCompanyReportPdf(params.id);
  }

  @Post('prospects/:id/report')
  async generateProspectCompanyReport(@Param() params: ProspectIdParamDto, @Body() dto: GenerateProspectReportDto) {
    return this.p1Service.generateProspectCompanyReport(params.id, 'web-demo', dto.modelKind ?? 'balanced');
  }

  @Patch('prospects/:id/status')
  async updateProspectStatus(@Param() params: ProspectIdParamDto, @Body() dto: UpdateProspectStatusDto) {
    return this.p1Service.updateProspectStatus(params.id, dto.status, dto.actor ?? 'sales-operator');
  }

  @Post('prospects/:id/generate-draft')
  async generateDraft(@Param() params: ProspectIdParamDto) {
    return this.p1Service.generateDraftForProspect(params.id, 'sales-operator');
  }

  @Get('drafts')
  async listDrafts(@Query() query: ListDraftsQueryDto) {
    return this.p1Service.listDrafts(query);
  }

  @Get('email-history')
  async listEmailHistory(@Query() query: ListEmailHistoryQueryDto) {
    return this.p1Service.listEmailHistory(query);
  }

  @Post('drafts/:id/review')
  async reviewDraft(@Param() params: DraftIdParamDto, @Body() dto: ReviewDraftDto) {
    return this.p1Service.reviewDraft(params.id, dto, dto.reviewer ?? 'sales-operator');
  }

  @Get('email-safe-mode')
  async getEmailSafeMode() {
    return this.p1Service.getEmailSafeModeConfig();
  }

  @Post('email-safe-mode/preview')
  async previewEmailSafeMode(@Body() dto: EmailSafeModePreviewDto) {
    return this.p1Service.previewEmailSafeMode(dto);
  }

  @Post('telegram/webhook')
  async telegramWebhook(@Query() query: TelegramWebhookQueryDto, @Body() payload: Record<string, unknown>) {
    return this.p1Service.handleTelegramWebhook(query.secret, payload);
  }

  @Get('templates')
  async listTemplates(@Query() query: ListTemplatesQueryDto) {
    return this.p1Service.listTemplates(query);
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.p1Service.createTemplate(dto, 'sales-admin');
  }

  @Patch('templates/:id')
  async updateTemplate(@Param() params: TemplateIdParamDto, @Body() dto: UpdateTemplateDto) {
    return this.p1Service.updateTemplate(params.id, dto, 'sales-admin');
  }

  @Get('template-candidates')
  async listTemplateCandidates(@Query() query: ListTemplateCandidatesQueryDto) {
    return this.p1Service.listTemplateCandidates(query);
  }

  @Post('template-learning/promote')
  async runTemplateLearningPromote() {
    return this.p1Service.runTemplateLearningPromote('sales-admin');
  }
}
