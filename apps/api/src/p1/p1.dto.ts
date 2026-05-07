import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateSearchJobDto {
  @IsOptional()
  @IsString()
  @Length(2, 128)
  keyword?: string;

  @IsOptional()
  @IsString()
  @Length(2, 128)
  companyName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  region?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  industry?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class ListSearchJobsQueryDto {
  @IsOptional()
  @IsIn(['queued', 'running', 'completed', 'failed'])
  status?: 'queued' | 'running' | 'completed' | 'failed';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListProspectsQueryDto {
  @IsOptional()
  @IsUUID()
  searchJobId?: string;

  @IsOptional()
  @IsIn(['new', 'qualified', 'contacted', 'meeting', 'disqualified', 'archived'])
  status?: 'new' | 'qualified' | 'contacted' | 'meeting' | 'disqualified' | 'archived';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ProspectIdParamDto {
  @IsUUID()
  id!: string;
}

export class DraftIdParamDto {
  @IsUUID()
  id!: string;
}

export class SearchJobIdParamDto {
  @IsUUID()
  id!: string;
}

export class UpdateProspectStatusDto {
  @IsIn(['new', 'qualified', 'contacted', 'meeting', 'disqualified', 'archived'])
  status!: 'new' | 'qualified' | 'contacted' | 'meeting' | 'disqualified' | 'archived';

  @IsOptional()
  @IsString()
  actor?: string;
}

export class EmailSafeModePreviewDto {
  @IsEmail()
  intendedRecipient!: string;

  @IsString()
  @Length(1, 400)
  subject!: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  draftId?: string;
}

export class ListDraftsQueryDto {
  @IsOptional()
  @IsIn(['pending_review', 'approved', 'rejected', 'sent'])
  status?: 'pending_review' | 'approved' | 'rejected' | 'sent';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ReviewDraftDto {
  @IsIn(['approve', 'reject', 'edit'])
  action!: 'approve' | 'reject' | 'edit';

  @IsOptional()
  @IsString()
  reviewer?: string;

  @IsOptional()
  @IsString()
  @Length(1, 400)
  subject?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsString()
  rejectReason?: string;
}

export class TelegramWebhookQueryDto {
  @IsString()
  secret!: string;
}
