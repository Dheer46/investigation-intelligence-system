import { IsEnum, IsOptional, IsString } from 'class-validator';
import { HypothesisStatus } from '@prisma/client';

export class HypothesisActionDto {
  @IsEnum(HypothesisStatus)
  action: HypothesisStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
