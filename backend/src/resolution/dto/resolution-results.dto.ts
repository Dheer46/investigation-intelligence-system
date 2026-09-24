import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class AutoMergeGroupDto {
  @IsString()
  entity_type: string;

  @IsString()
  canonical_name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  member_entity_ids: string[];

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class ReviewCandidateGroupDto {
  @IsString()
  entity_type: string;

  @IsString()
  canonical_name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  member_entity_ids: string[];

  @IsNumber()
  @Min(0)
  @Max(1)
  match_score: number;
}

export class ResolutionResultsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutoMergeGroupDto)
  auto_merges: AutoMergeGroupDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewCandidateGroupDto)
  review_candidates: ReviewCandidateGroupDto[];
}
