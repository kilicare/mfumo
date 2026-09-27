import { IsOptional, IsString, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderFilterDto {
  @IsOptional()
  @IsString()
  search?: string; // PO number, supplier name

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsEnum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  sortBy?: string; // 'poNumber', 'totalAmount', 'orderDate', 'createdAt'

  @IsOptional()
  @IsString()
  sortOrder?: string; // 'asc', 'desc'

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
