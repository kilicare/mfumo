import { IsString, IsOptional } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  name: string;

  @IsString()
  symbol: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UnitResponseDto {
  id: string;
  name: string;
  symbol: string;
  description?: string;
  isActive: boolean;
}
