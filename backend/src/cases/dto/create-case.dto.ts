import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCaseDto {
  @IsString()
  @MinLength(3)
  caseNumber: string;

  @IsString()
  @MinLength(3)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
