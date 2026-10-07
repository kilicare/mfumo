import { IsOptional, IsString, IsIn, IsNumber, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderFilterDto {
  @IsOptional()
  @IsString()
  search?: string; // PO number, supplier name

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @IsOptional()
  @IsIn(['poNumber', 'totalAmount', 'orderDate', 'createdAt'])
  sortBy?: string; // 'poNumber', 'totalAmount', 'orderDate', 'createdAt'

  @IsOptional()
  @IsIn(['asc', 'desc'])
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
