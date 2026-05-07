import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from 'class-validator';

export class CreateIcpProfileDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  industries!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  countries!: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  revenueMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  employeeMin?: number;

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  targetRoles!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  painKeywords!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  productFocus!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateIcpProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  industries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  countries?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  revenueMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  employeeMin?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  targetRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  painKeywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  productFocus?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IcpIdParamDto {
  @IsUUID()
  id!: string;
}

export class ListIcpProfilesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  active?: 'active' | 'inactive';

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
