import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CandidateIdParamDto {
  @IsUUID()
  id!: string;
}

export class ListCandidatesQueryDto {
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsIn(['new', 'enriching', 'ready', 'outreach', 'meeting', 'opportunity', 'disqualified', 'archived'])
  status?:
    | 'new'
    | 'enriching'
    | 'ready'
    | 'outreach'
    | 'meeting'
    | 'opportunity'
    | 'disqualified'
    | 'archived';

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
