import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateDiscoveryJobDto {
  @IsUUID()
  icpId!: string;

  @IsString()
  source!: string;
}

export class DiscoveryJobIdParamDto {
  @IsUUID()
  id!: string;
}

export class ListDiscoveryJobsQueryDto {
  @IsOptional()
  @IsIn(['queued', 'running', 'completed', 'failed'])
  status?: 'queued' | 'running' | 'completed' | 'failed';

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
