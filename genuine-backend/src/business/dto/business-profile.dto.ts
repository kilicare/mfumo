import { IsString, IsNumber, IsBoolean, IsEnum, IsOptional, Min, Max } from 'class-validator';

export class UpdateBusinessProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercentage?: number;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApprovalForDiscounts?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApprovalForReturns?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(['FIFO', 'WEIGHTED_AVERAGE'])
  costingMethod?: 'FIFO' | 'WEIGHTED_AVERAGE';
}

export class BusinessProfileResponseDto {
  id: string;
  name: string;
  businessType: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  currency: string;
  taxPercentage: number;
  allowNegativeStock: boolean;
  requireApprovalForDiscounts: boolean;
  requireApprovalForReturns: boolean;
  costingMethod: string;
  isSetupComplete: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
