import { IsString, IsOptional, IsNumber, Min, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUnitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  symbol: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  baseUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.0001)
  conversionFactor?: number;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  symbol?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  baseUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.0001)
  conversionFactor?: number;
}

export class UnitResponseDto {
  id: string;
  businessId: string | null;
  name: string;
  symbol: string;
  description?: string;
  baseUnit?: string;
  conversionFactor: number;
  isSystem: boolean;
  isActive: boolean;
}
