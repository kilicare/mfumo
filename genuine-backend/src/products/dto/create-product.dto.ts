import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class ProductUnitDto {
  @IsString()
  unitId: string;

  @IsNumber()
  @Min(0.01)
  conversionFactor: number;

  @IsBoolean()
  isDefault: boolean;
}

export class CreateProductDto {
  @IsString()
  sku: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsNumber()
  @Min(0)
  buyingPrice: number;

  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @IsOptional()
  @IsNumber()
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
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
  status?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expiryDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresExpiry?: boolean;
}
