import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ReviewDecisionAction {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ReviewDecisionDto {
  @IsEnum(ReviewDecisionAction)
  decision: ReviewDecisionAction;

  @IsOptional()
  @IsString()
  notes?: string;
}
