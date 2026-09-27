import { IsOptional, IsString, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SupplierFilterDto {
  @IsOptional()
  @IsString()
  search?: string; // name, code, email, phone

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'OVERDUE'])
  status?: string;

  @IsOptional()
  @IsString()
  sortBy?: string; // 'name', 'outstanding', 'lastPurchase', 'createdAt'

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

export class CustomerFilterDto {
  @IsOptional()
  @IsString()
  search?: string; // name, code, email, phone

  @IsOptional()
  @IsEnum(['RETAIL', 'WHOLESALE', 'CORPORATE', 'DISTRIBUTOR'])
  customerType?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'OVERDUE'])
  status?: string;

  @IsOptional()
  @IsString()
  sortBy?: string; // 'name', 'outstanding', 'lastSale', 'createdAt'

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
