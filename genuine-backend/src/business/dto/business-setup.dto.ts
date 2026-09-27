import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

enum CurrencyCode {
  TZS = 'TZS',
  USD = 'USD',
  EUR = 'EUR',
  KES = 'KES',
  UGX = 'UGX',
}

enum CostingMethodType {
  FIFO = 'FIFO',
  WEIGHTED_AVERAGE = 'WEIGHTED_AVERAGE',
}

class LocationSetupDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsEnum(['WAREHOUSE', 'SHOP', 'BRANCH', 'DEPOT'])
  type: 'WAREHOUSE' | 'SHOP' | 'BRANCH' | 'DEPOT';

  @IsOptional()
  @IsString()
  description?: string;
}

export class BusinessSetupDto {
  @IsString()
  businessName: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsString()
  businessType: string;

  @IsEnum(CurrencyCode)
  currency: CurrencyCode;

  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercentage: number;

  @IsEnum(CostingMethodType)
  costingMethod: CostingMethodType;

  @IsBoolean()
  allowNegativeStock: boolean;

  @IsBoolean()
  requireApprovalForDiscounts: boolean;

  @IsBoolean()
  requireApprovalForReturns: boolean;

  @ValidateNested({ each: true })
  @Type(() => LocationSetupDto)
  @ArrayMinSize(1)
  locations: LocationSetupDto[];

  @IsOptional()
  @IsString({ each: true })
  paymentMethods?: string[];

  @IsOptional()
  @IsString({ each: true })
  expenseCategories?: string[];
}
