import {
  IsString,
  IsArray,
  IsNumber,
  IsEnum,
  ValidateNested,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductDto } from './create-product.dto';

export class BulkUpdatePriceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceUpdateItemDto)
  items: PriceUpdateItemDto[];
}

class PriceUpdateItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyingPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;
}

export class BulkUpdateStatusDto {
  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
  status: string;
}

export class BulkImportProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  products: CreateProductDto[];
}
