import { Type } from 'class-transformer';
import { ExpenseBudgetPeriod } from '../../business/dto/expense-category.dto';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';

export enum ExpenseStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

export class CreateExpenseItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  expenseCategoryId?: string;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateExpenseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  expenseCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  paymentMethodId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseItemDto)
  items: CreateExpenseItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  expenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  // Backward-compatible alias retained for existing clients.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  budgetCode?: string;

  // Kept for compatible clients; an expense cannot bypass approval/payment workflow.
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  expenseCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  paymentMethodId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseItemDto)
  items?: CreateExpenseItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string | null;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  budgetCode?: string | null;
}

export class ApproveExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RejectExpenseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}

export class PayExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  transactionReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ExpenseFilterDto {
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  months?: string;

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

export class ExpenseItemResponseDto {
  id: string;
  expenseCategoryId: string;
  categoryName: string;
  description?: string;
  amount: number;
  notes?: string;
}

export class ExpenseResponseDto {
  id: string;
  businessId: string;
  expenseNumber: string;
  expenseCategoryId: string;
  categoryName: string;
  status: ExpenseStatus;
  totalAmount: number;
  isPaid: boolean;
  reference?: string;
  expenseDate: Date;
  description?: string;
  items: ExpenseItemResponseDto[];
  attachment?: string;
  notes?: string;
  supplier?: { id: string; name: string; code: string };
  paymentMethod?: { id: string; name: string };
  approvedBy?: { id: string; name: string; email: string };
  approvedAt?: Date;
  approvalNotes?: string;
  paidBy?: { id: string; name: string };
  paidAt?: Date;
  paymentReference?: string;
  rejectedBy?: { id: string; name: string };
  rejectedAt?: Date;
  rejectionReason?: string;
  createdBy: { id: string; name: string; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ExpenseSummaryDto {
  totalExpenses: number;
  totalApproved: number;
  totalPaid: number;
  totalPending: number;
  totalRejected: number;
  averageExpenseAmount: number;
  largestExpense: number;
  smallestExpense: number;
  byCategory: { category: string; count: number; total: number; percentage: number }[];
}

export class BudgetStatusDto {
  categoryId: string;
  categoryName: string;
  budgetLimit: number;
  budgetPeriod: ExpenseBudgetPeriod;
  spent: number;
  available: number;
  utilization: number;
  status: 'ON_TRACK' | 'WARNING' | 'EXCEEDED';
}
