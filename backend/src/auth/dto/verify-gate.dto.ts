import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class VerifyGateDto {
  @IsString()
  tokenId: string;

  @IsString()
  @MinLength(4)
  pin: string;

  @IsArray()
  @ArrayMinSize(5)
  images: string[];
}
