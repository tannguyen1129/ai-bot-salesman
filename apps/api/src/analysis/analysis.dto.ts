import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CandidateIdParamDto {
  @IsUUID()
  id!: string;
}

export class JobIdParamDto {
  @IsUUID()
  id!: string;
}

export class AnalyzeJobDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
