import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { JwtAuthGuard, PermissionGuard } from '../common/guards';
import {
  ComparisonFilterDto,
  CustomerAnalyticsFilterDto,
  DashboardFilterDto,
  ExportFilterDto,
  ForecastFilterDto,
  KPIFilterDto,
  ProductPerformanceFilterDto,
  SalesByChannelFilterDto,
  SupplierAnalyticsFilterDto,
  TrendAnalysisFilterDto,
} from './dto';
import { AnalyticsService } from './analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto';

@ApiTags('Analytics & Reporting')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('dashboard/executive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('reports.view')
  @ApiOperation({ summary: 'Get executive dashboard metrics and charts' })
  executive(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.run('dashboard.executive', businessId, userId, filter, () =>
      this.analytics.getExecutiveDashboard(businessId, filter),
    );
  }

  @Get('dashboard/sales')
  @RequirePermission('reports.view')
  salesDashboard(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.run('dashboard.sales', businessId, userId, filter, () =>
      this.analytics.getSalesDashboard(businessId, filter),
    );
  }

  @Get('dashboard/inventory')
  @RequirePermission('reports.view')
  inventoryDashboard(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.run('dashboard.inventory', businessId, userId, filter, () =>
      this.analytics.getInventoryDashboard(businessId, filter),
    );
  }

  @Get('kpis')
  @RequirePermission('reports.view')
  kpis(@Business() businessId: string, @UserId() userId: string, @Query() filter: KPIFilterDto) {
    return this.run('kpis', businessId, userId, filter, () =>
      this.analytics.getKPIs(businessId, filter),
    );
  }

  @Get('kpis/:name')
  @RequirePermission('reports.view')
  kpiDetail(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('name') name: string,
    @Query() filter: KPIFilterDto,
  ) {
    return this.run(`kpi.${name}`, businessId, userId, filter, () =>
      this.analytics.getKPIDetail(businessId, name, filter),
    );
  }

  @Get('trends')
  @RequirePermission('reports.view')
  trends(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: TrendAnalysisFilterDto,
  ) {
    return this.run('trends', businessId, userId, filter, () =>
      this.analytics.analyzeTrends(businessId, filter),
    );
  }

  @Get('forecast')
  @RequirePermission('reports.view')
  forecast(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: ForecastFilterDto,
  ) {
    return this.run('forecast', businessId, userId, filter, () =>
      this.analytics.forecastMetric(businessId, filter),
    );
  }

  @Get('products')
  @RequirePermission('reports.view')
  products(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: ProductPerformanceFilterDto,
  ) {
    return this.run('product-performance', businessId, userId, filter, () =>
      this.analytics.getProductPerformance(businessId, filter),
    );
  }

  @Get('customers')
  @RequirePermission('reports.view')
  customers(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: CustomerAnalyticsFilterDto,
  ) {
    return this.run('customer-analytics', businessId, userId, filter, () =>
      this.analytics.getCustomerAnalytics(businessId, filter),
    );
  }

  @Get('suppliers')
  @RequirePermission('reports.view')
  suppliers(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: SupplierAnalyticsFilterDto,
  ) {
    return this.run('supplier-analytics', businessId, userId, filter, () =>
      this.analytics.getSupplierAnalytics(businessId, filter),
    );
  }

  @Get('sales-by-channel')
  @RequirePermission('reports.view')
  salesByChannel(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: SalesByChannelFilterDto,
  ) {
    return this.run('sales-by-channel', businessId, userId, filter, () =>
      this.analytics.getSalesByChannel(businessId, filter),
    );
  }

  @Get('expense-breakdown')
  @RequirePermission('reports.view')
  expenseBreakdown(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.run('expense-breakdown', businessId, userId, filter, () =>
      this.analytics.getExpenseBreakdown(businessId, filter),
    );
  }

  @Get('compare-periods')
  @RequirePermission('reports.view')
  comparePeriods(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: ComparisonFilterDto,
  ) {
    return this.run('compare-periods', businessId, userId, filter, () =>
      this.analytics.comparePeriods(businessId, filter),
    );
  }

  @Get('export')
  @RequirePermission('reports.export')
  async export(
    @Business() businessId: string,
    @UserId() userId: string,
    @Query() filter: ExportFilterDto,
    @Res() response: Response,
  ) {
    const result = await this.analytics.exportReport(businessId, filter);
    await this.analytics.recordReportAccess(
      businessId,
      userId,
      `export.${filter.reportType}`,
      {
        format: result.format,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        periodId: filter.periodId,
      },
      {
        fileName: result.fileName,
        byteLength: Buffer.isBuffer(result.content)
          ? result.content.byteLength
          : Buffer.byteLength(result.content, 'utf8'),
      },
    );
    await this.notifications.publishEvent({
      businessId,
      eventType: NotificationEventType.REPORT_GENERATED,
      referenceId: `${filter.reportType}:${Date.now()}`,
      referenceType: 'AnalyticsReport',
      idempotencyKey: `REPORT_GENERATED:${userId}:${filter.reportType}:${Date.now()}`,
      variables: { reportName: filter.reportType, format: result.format },
    });
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    response.setHeader('Cache-Control', 'no-store');
    return response.status(HttpStatus.OK).send(result.content);
  }

  private async run<T>(
    reportName: string,
    businessId: string,
    userId: string,
    filter: unknown,
    execute: () => Promise<T>,
  ) {
    const result = await execute();
    const summary = Array.isArray(result)
      ? { rowCount: result.length }
      : result && typeof result === 'object'
        ? {
            rowCount: Array.isArray((result as any).data) ? (result as any).data.length : undefined,
            returnedFields: Object.keys(result as object),
          }
        : {};
    await this.analytics.recordReportAccess(businessId, userId, reportName, filter, summary);
    return result;
  }
}
