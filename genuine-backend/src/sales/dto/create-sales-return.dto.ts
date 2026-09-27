import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SalesReturnItemDto {
  @IsString()
  @Length(1, 64)
  salesInvoiceItemId: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @IsIn(['DEFECTIVE', 'EXPIRED', 'WRONG_ITEM', 'CUSTOMER_REQUEST', 'OTHER'])
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSalesReturnDto {
  @IsString()
  @Length(1, 64)
  salesInvoiceId: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  returnNumber?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesReturnItemDto)
  items: SalesReturnItemDto[];

  @IsOptional()
  @IsBoolean()
  authorizeNow?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SalesReturnFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  salesInvoiceId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'AUTHORIZED', 'RECEIVED', 'COMPLETED', 'REJECTED'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
