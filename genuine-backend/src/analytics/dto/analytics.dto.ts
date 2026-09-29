import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const ANALYTICS_GROUPS = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type AnalyticsGroup = (typeof ANALYTICS_GROUPS)[number];

export class PeriodFilterDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class DashboardFilterDto extends PeriodFilterDto {
  @IsOptional()
  @IsIn(ANALYTICS_GROUPS)
  groupBy?: AnalyticsGroup;
}

export class KPIFilterDto extends PeriodFilterDto {
  @IsOptional()
  @IsIn(['SALES', 'PROFITABILITY', 'EFFICIENCY', 'LIQUIDITY', 'GROWTH', 'ALL'])
  category?: 'SALES' | 'PROFITABILITY' | 'EFFICIENCY' | 'LIQUIDITY' | 'GROWTH' | 'ALL';
}

export class TrendAnalysisFilterDto extends PeriodFilterDto {
  @IsIn(['REVENUE', 'EXPENSES', 'PROFIT', 'SALES_QUANTITY', 'CUSTOMER_COUNT', 'INVENTORY'])
  metric: 'REVENUE' | 'EXPENSES' | 'PROFIT' | 'SALES_QUANTITY' | 'CUSTOMER_COUNT' | 'INVENTORY';

  @IsOptional()
  @IsIn(ANALYTICS_GROUPS)
  groupBy?: AnalyticsGroup;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(120)
  periods?: number;
}

export class ForecastFilterDto extends PeriodFilterDto {
  @IsIn(['REVENUE', 'EXPENSES', 'PROFIT', 'SALES_QUANTITY', 'CUSTOMER_COUNT'])
  metric: 'REVENUE' | 'EXPENSES' | 'PROFIT' | 'SALES_QUANTITY' | 'CUSTOMER_COUNT';

  @IsOptional()
  @IsIn(['SIMPLE_LINEAR', 'EXPONENTIAL_SMOOTHING', 'MOVING_AVERAGE'])
  method?: 'SIMPLE_LINEAR' | 'EXPONENTIAL_SMOOTHING' | 'MOVING_AVERAGE';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  periods?: number;
}

export class ProductPerformanceFilterDto extends PeriodFilterDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(['REVENUE', 'QUANTITY', 'PROFIT', 'MARGIN'])
  sortBy?: 'REVENUE' | 'QUANTITY' | 'PROFIT' | 'MARGIN';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CustomerAnalyticsFilterDto extends PeriodFilterDto {
  @IsOptional()
  @IsIn(['REVENUE', 'FREQUENCY', 'LOYALTY', 'RECENCY'])
  segmentBy?: 'REVENUE' | 'FREQUENCY' | 'LOYALTY' | 'RECENCY';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class SupplierAnalyticsFilterDto extends PeriodFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class SalesByChannelFilterDto extends DashboardFilterDto {
  @IsOptional()
  @IsIn(['LOCATION', 'SALESPERSON', 'CUSTOMER_TYPE'])
  channelBy?: 'LOCATION' | 'SALESPERSON' | 'CUSTOMER_TYPE';
}

export class ComparisonFilterDto {
  @IsOptional()
  @IsString()
  period1Id?: string;

  @IsOptional()
  @IsString()
  period2Id?: string;

  @IsOptional()
  @IsDateString()
  dateFrom1?: string;

  @IsOptional()
  @IsDateString()
  dateTo1?: string;

  @IsOptional()
  @IsDateString()
  dateFrom2?: string;

  @IsOptional()
  @IsDateString()
  dateTo2?: string;
}

export class ExportFilterDto extends PeriodFilterDto {
  @IsIn(['CSV', 'EXCEL', 'PDF', 'JSON'])
  format: 'CSV' | 'EXCEL' | 'PDF' | 'JSON';

  @IsIn([
    'DASHBOARD',
    'SALES_DASHBOARD',
    'INVENTORY_DASHBOARD',
    'INCOME_STATEMENT',
    'CASH_FLOW',
    'RECEIVABLES_AGEING',
    'PAYABLES_AGEING',
    'KPI',
    'PRODUCT_PERFORMANCE',
    'CUSTOMER_ANALYTICS',
    'SUPPLIER_ANALYTICS',
    'SALES_BY_CHANNEL',
    'EXPENSE_BREAKDOWN',
  ])
  reportType: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsIn(['SALES', 'PROFITABILITY', 'EFFICIENCY', 'LIQUIDITY', 'GROWTH', 'ALL'])
  category?: KPIFilterDto['category'];

  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'])
  groupBy?: AnalyticsGroup;
}

export interface AnalyticsMetric {
  name: string;
  value: number;
  unit: string;
  previousValue: number;
  changePercent: number | null;
  trend: 'UP' | 'DOWN' | 'FLAT';
  status: 'GOOD' | 'WARNING' | 'CRITICAL';
  target?: number;
  formula?: string;
}

export interface TrendPoint {
  period: string;
  date: Date;
  value: number;
  percentChange: number | null;
  movingAverage: number;
}
