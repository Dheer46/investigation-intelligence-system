import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class EnrollBiometricDto {
  @IsArray()
  @ArrayMinSize(10)
  images: string[];

  @IsString()
  @MinLength(4)
  pin: string;
}
