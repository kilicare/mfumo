import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsObject,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const number = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 } as const;

export class StockAdjustmentItemDto {
  @IsString() productId: string;
  @IsString() locationId: string;
  @Type(() => Number) @IsNumber(number) quantity: number;
  @IsIn(['INVENTORY_COUNT', 'DAMAGE', 'EXPIRY', 'THEFT', 'SYSTEM_CORRECTION', 'OTHER'])
  reason: string;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateStockAdjustmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items: StockAdjustmentItemDto[];
  @IsOptional() @IsString() notes?: string;
}

export class RejectInventoryDto {
  @IsString() reason: string;
}

export class StockTransferItemDto {
  @IsString() productId: string;
  @Type(() => Number) @IsNumber(number) @Min(0.0001) quantity: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateStockTransferDto {
  @IsString() fromLocationId: string;
  @IsString() toLocationId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items: StockTransferItemDto[];
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ReceiveStockTransferDto {
  @IsOptional()
  @IsObject()
  receivedQuantities?: Record<string, number>;
}

export class PhysicalCountItemDto {
  @IsString() productId: string;
  @Type(() => Number) @IsNumber(number) @Min(0) countedQuantity: number;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePhysicalCountDto {
  @IsString() locationId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PhysicalCountItemDto)
  items: PhysicalCountItemDto[];
  @IsOptional() @IsString() notes?: string;
}

export class ReportPaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() productId?: string;
}

export class StockValuationReportDto extends ReportPaginationDto {
  @IsOptional() @IsIn(['FIFO', 'LIFO', 'WEIGHTED_AVERAGE']) valuationMethod?: string;
}

export class LowStockReportDto extends ReportPaginationDto {
  @IsOptional() @IsIn(['BELOW_MINIMUM', 'REORDER', 'BOTH']) type?: string;
}

export class ExpiryReportDto extends ReportPaginationDto {
  @IsOptional()
  @IsIn(['EXPIRED', 'EXPIRING_7_DAYS', 'EXPIRING_30_DAYS', 'EXPIRING_90_DAYS', 'ALL'])
  status?: string;
  @IsOptional() @IsDateString() asOfDate?: string;
}

export class StockAgeingReportDto extends ReportPaginationDto {
  @IsOptional() @IsDateString() asOfDate?: string;
}

export class InventoryMovementReportDto extends ReportPaginationDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsIn(['createdAt', 'type', 'quantity']) sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: string;
}

export class StockAdjustmentResponseDto {}
export class StockTransferResponseDto {}
export class PhysicalCountResponseDto {}
