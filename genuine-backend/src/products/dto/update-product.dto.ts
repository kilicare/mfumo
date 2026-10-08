import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ProductUnitUpdateDto {
  @IsString()
  unitId: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.0001)
  conversionFactor: number;

  @IsBoolean()
  isDefault: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() brandId?: string | null;
  @IsOptional() @IsString() supplierId?: string | null;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  buyingPrice?: number;
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number | null;

  @IsOptional() @IsString() defaultUnitId?: string;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitUpdateDto)
  @IsArray()
  productUnits?: ProductUnitUpdateDto[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(180000, { each: true })
  @ArrayMaxSize(5)
  images?: string[];
  @IsOptional() @IsInt() @Min(0) minimumStock?: number;
  @IsOptional() @IsInt() @Min(0) reorderLevel?: number;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']) status?: string;
  @IsOptional() @IsString() @MaxLength(128) barcode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) manufacturer?: string | null;
  @IsOptional() @IsNumber({ allowInfinity: false, allowNaN: false }) @Min(0) weight?: number | null;
  @IsOptional() @IsString() @MaxLength(80) color?: string | null;
  @IsOptional() @IsString() @MaxLength(80) size?: string | null;
  @IsOptional() @IsInt() @Min(0) expiryDays?: number | null;
  @IsOptional() @IsBoolean() requiresExpiry?: boolean;
}
