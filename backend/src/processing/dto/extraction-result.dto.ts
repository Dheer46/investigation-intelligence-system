import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class ExtractedEntityInputDto {
  @IsString()
  entity_type: string;

  @IsString()
  raw_text: string;

  @IsOptional()
  @IsString()
  normalized?: string;

  @IsString()
  location_ref: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsString()
  source: string;
}

export class ExtractedRelationInputDto {
  @IsString()
  source_text: string;

  @IsString()
  subject_text: string;

  @IsString()
  predicate: string;

  @IsString()
  object_text: string;

  @IsString()
  location_ref: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;
}

export class ExtractionResultDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ExtractedEntityInputDto)
  entities: ExtractedEntityInputDto[];

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ExtractedRelationInputDto)
  relations: ExtractedRelationInputDto[];
}
