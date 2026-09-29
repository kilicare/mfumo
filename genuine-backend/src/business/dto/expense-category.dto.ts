import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum ExpenseBudgetPeriod {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

export class CreateExpenseCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  budgetLimit?: number;

  @IsOptional()
  @IsEnum(ExpenseBudgetPeriod)
  budgetPeriod?: ExpenseBudgetPeriod;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  budgetLimit?: number | null;

  @IsOptional()
  @IsEnum(ExpenseBudgetPeriod)
  budgetPeriod?: ExpenseBudgetPeriod | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ExpenseCategoryResponseDto {
  id: string;
  businessId: string;
  name: string;
  code: string;
  description?: string;
  budgetLimit?: number;
  budgetPeriod?: ExpenseBudgetPeriod;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
