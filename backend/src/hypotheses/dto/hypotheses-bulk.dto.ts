import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsObject, Max, Min, ValidateNested } from 'class-validator';
import { IsString } from 'class-validator';

export class HypothesisInputDto {
  @IsString()
  hypothesis_text: string;

  @IsObject()
  evidence_summary: Record<string, unknown>;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsObject()
  provenance: Record<string, unknown>;
}

export class HypothesesBulkDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => HypothesisInputDto)
  hypotheses: HypothesisInputDto[];
}
