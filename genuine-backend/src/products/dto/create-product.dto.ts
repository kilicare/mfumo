import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class ProductUnitDto {
  @IsString()
  unitId: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  conversionFactor: number;

  @IsBoolean()
  isDefault: boolean;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  buyingPrice: number;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number;

  @IsString()
  defaultUnitId: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitDto)
  @ArrayMinSize(1)
  productUnits?: ProductUnitDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(180000, { each: true })
  @ArrayMaxSize(5)
  images?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  size?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  expiryDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresExpiry?: boolean;
}
