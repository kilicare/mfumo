import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum PaymentReferenceType {
  SalesInvoice = 'SalesInvoice',
  PurchaseOrder = 'PurchaseOrder',
  Expense = 'Expense',
  Other = 'Other',
}
export enum PaymentDirection {
  INFLOW = 'INFLOW',
  OUTFLOW = 'OUTFLOW',
}

export class CreatePaymentDto {
  @IsEnum(PaymentReferenceType)
  referenceType: PaymentReferenceType;

  // Application IDs are cuid/uuid strings; IsUUID rejects valid cuid IDs.
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  referenceId: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountNumber?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  chequeNumber?: string;
  @IsOptional()
  @IsString()
  @MaxLength(160)
  transactionId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentNumber?: string;
  @IsOptional()
  @IsDateString()
  paymentDate?: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
  @IsOptional()
  @IsEnum(PaymentDirection)
  direction?: PaymentDirection;
}

export class ReconcilePaymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  bankStatementReference: string;
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class VoidPaymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}

export class CreateAccountingPeriodDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  periodName: string;
  @IsDateString()
  startDate: string;
  @IsDateString()
  endDate: string;
  @IsOptional()
  @IsEnum(['OPEN'])
  status?: 'OPEN';
}

export class CloseAccountingPeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  closingNotes?: string;
}

export class PaymentListQueryDto {
  @IsOptional()
  @IsString()
  referenceType?: string;
  @IsOptional()
  @IsString()
  status?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class FinancialReportQueryDto {
  @IsOptional()
  @IsString()
  periodId?: string;
  @IsOptional()
  @IsDateString()
  dateFrom?: string;
  @IsOptional()
  @IsDateString()
  dateTo?: string;
  @IsOptional()
  @IsEnum(['DAILY', 'WEEKLY', 'MONTHLY'])
  groupBy?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  @IsOptional()
  @IsString()
  customerId?: string;
  @IsOptional()
  @IsString()
  supplierId?: string;
  @IsOptional()
  @IsDateString()
  dateAs?: string;
}
