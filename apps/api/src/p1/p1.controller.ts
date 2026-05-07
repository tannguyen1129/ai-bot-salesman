import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateSearchJobDto,
  DraftIdParamDto,
  EmailSafeModePreviewDto,
  ListDraftsQueryDto,
  ListProspectsQueryDto,
  ListSearchJobsQueryDto,
  ProspectIdParamDto,
  ReviewDraftDto,
  SearchJobIdParamDto,
  TelegramWebhookQueryDto,
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

  @Get('prospects')
  async listProspects(@Query() query: ListProspectsQueryDto) {
    return this.p1Service.listProspects(query);
  }

  @Get('prospects/:id/report')
  async getProspectCompanyReport(@Param() params: ProspectIdParamDto) {
    return this.p1Service.getProspectCompanyReport(params.id);
  }

  @Post('prospects/:id/report')
  async generateProspectCompanyReport(@Param() params: ProspectIdParamDto) {
    return this.p1Service.generateProspectCompanyReport(params.id, 'web-demo');
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
}
