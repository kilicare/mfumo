import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { deflateRawSync } from 'node:zlib';
import {
  AnalyticsGroup,
  ComparisonFilterDto,
  CustomerAnalyticsFilterDto,
  DashboardFilterDto,
  ExportFilterDto,
  ForecastFilterDto,
  KPIFilterDto,
  PeriodFilterDto,
  ProductPerformanceFilterDto,
  SalesByChannelFilterDto,
  SupplierAnalyticsFilterDto,
  TrendAnalysisFilterDto,
  TrendPoint,
} from './dto';
import { PrismaService } from '../database/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { InventoryService } from '../inventory/inventory.service';

const MONEY_EPSILON = 1e-8;
const RECOGNIZED_INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];
const RECOGNIZED_RETURN_STATUSES = ['RECEIVED', 'COMPLETED'];
const RECOGNIZED_EXPENSE_STATUSES = ['APPROVED', 'PAID'];
const ACTIVE_PAYMENT_STATUSES = ['RECORDED', 'VERIFIED', 'RECONCILED', 'COMPLETED'];

type DateRange = { startDate: Date; endDate: Date; periodName: string };
type ReportContext = { range: DateRange; currency: string };

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const percentChange = (current: number, previous: number): number | null => {
  if (Math.abs(previous) < MONEY_EPSILON) return Math.abs(current) < MONEY_EPSILON ? 0 : null;
  return round(((current - previous) / Math.abs(previous)) * 100);
};

const trend = (current: number, previous: number): 'UP' | 'DOWN' | 'FLAT' =>
  current > previous + MONEY_EPSILON ? 'UP' : current < previous - MONEY_EPSILON ? 'DOWN' : 'FLAT';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly inventory: InventoryService,
  ) {}

  async getExecutiveDashboard(businessId: string, filter: DashboardFilterDto) {
    const { range, currency } = await this.context(businessId, filter);
    const previous = this.previousRange(range);
    const [
      statement,
      previousStatement,
      balance,
      previousBalance,
      valuation,
      invoices,
      previousInvoiceCount,
      purchaseOrders,
      previousPurchaseOrders,
    ] = await Promise.all([
      this.payments.getIncomeStatement(businessId, this.asFinancialFilter(range)),
      this.payments.getIncomeStatement(businessId, this.asFinancialFilter(previous)),
      this.payments.getFinancialSummary(businessId, { dateAs: range.endDate.toISOString() }),
      this.payments.getFinancialSummary(businessId, { dateAs: previous.endDate.toISOString() }),
      this.inventory.getStockValuationReport(businessId, { page: 1, limit: 100 }),
      this.prisma.salesInvoice.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: range.startDate, lte: range.endDate },
        },
        select: { id: true, totalAmount: true },
      }),
      this.prisma.salesInvoice.count({
        where: {
          businessId,
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: previous.startDate, lte: previous.endDate },
        },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          businessId,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          orderDate: { gte: range.startDate, lte: range.endDate },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          businessId,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          orderDate: { gte: previous.startDate, lte: previous.endDate },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const salesTrend = await this.series(businessId, 'REVENUE', range, filter.groupBy || 'MONTHLY');
    const expenseTrend = await this.series(
      businessId,
      'EXPENSES',
      range,
      filter.groupBy || 'MONTHLY',
    );
    const cashFlow = await this.payments.getCashFlowReport(businessId, {
      dateFrom: range.startDate.toISOString(),
      dateTo: range.endDate.toISOString(),
      groupBy: this.financialGroup(filter.groupBy || 'MONTHLY'),
    });
    const [products, customers, kpis] = await Promise.all([
      this.getProductPerformance(businessId, {
        dateFrom: range.startDate.toISOString(),
        dateTo: range.endDate.toISOString(),
        page: 1,
        limit: 5,
        sortBy: 'REVENUE',
      }),
      this.getCustomerAnalytics(businessId, {
        dateFrom: range.startDate.toISOString(),
        dateTo: range.endDate.toISOString(),
        page: 1,
        limit: 5,
        segmentBy: 'REVENUE',
      }),
      this.calculateKpis(businessId, range, currency, 'ALL'),
    ]);

    const summary = {
      totalRevenue: this.metric(
        'Total Revenue',
        statement.revenue,
        currency,
        previousStatement.revenue,
      ),
      totalExpenses: this.metric(
        'Recognized Expenses',
        statement.operatingExpenses,
        currency,
        previousStatement.operatingExpenses,
      ),
      totalProfit: this.metric(
        'Net Profit',
        statement.netIncome,
        currency,
        previousStatement.netIncome,
      ),
      profitMargin: this.metric(
        'Net Profit Margin',
        statement.netMarginPercentage,
        '%',
        previousStatement.netMarginPercentage,
      ),
      totalSales: this.metric('Invoices Issued', invoices.length, 'Invoices', previousInvoiceCount),
      totalPurchases: this.metric(
        'Non-draft Purchase Orders',
        round(purchaseOrders._sum.totalAmount || 0),
        currency,
        round(previousPurchaseOrders._sum.totalAmount || 0),
      ),
      cashOnHand: this.metric(
        'Net Cash Position',
        balance.cashOnHand,
        currency,
        previousBalance.cashOnHand,
      ),
      outstandingReceivables: this.metric(
        'Outstanding Receivables',
        balance.totalReceivables,
        currency,
        previousBalance.totalReceivables,
      ),
      outstandingPayables: this.metric(
        'Outstanding Payables',
        balance.totalPayables,
        currency,
        previousBalance.totalPayables,
      ),
      inventoryValue: this.metric(
        'Inventory Value',
        valuation.totalValue,
        currency,
        valuation.totalValue,
        'Current inventory valuation snapshot; not compared to historical stock value.',
      ),
    };

    return {
      period: range.periodName,
      asOf: range.endDate,
      inventoryAsOf: new Date(),
      currency,
      summary,
      kpis,
      charts: {
        periods: salesTrend.map((point) => point.period),
        revenueVsExpenses: [
          { label: 'Revenue', data: salesTrend.map((point) => point.value) },
          { label: 'Expenses', data: expenseTrend.map((point) => point.value) },
        ],
        topProducts: {
          labels: products.data.map((product) => product.productName),
          revenue: products.data.map((product) => product.revenue),
          quantity: products.data.map((product) => product.quantity),
        },
        salesTrend: {
          labels: salesTrend.map((point) => point.period),
          values: salesTrend.map((p) => p.value),
        },
        cashFlow: {
          labels: cashFlow.details.map((point) => point.date),
          inflows: cashFlow.details.map((point) => point.inflows),
          outflows: cashFlow.details.map((point) => point.outflows),
          netFlow: cashFlow.details.map((point) => point.netFlow),
        },
        customerMetrics: {
          labels: customers.data.map((customer) => customer.customerName),
          revenue: customers.data.map((customer) => customer.totalRevenue),
          transactions: customers.data.map((customer) => customer.transactionCount),
        },
      },
      definitions: {
        revenue: 'Issued invoice totals less accepted customer returns in the selected period.',
        profit:
          'Net income from the existing income statement (revenue less inventory-movement COGS and approved/paid expenses).',
        purchases:
          'Non-draft, non-cancelled purchase order totals by order date; this is procurement volume, not COGS.',
        cashPosition:
          'Cumulative active ledger inflows minus outflows through the selected as-of date.',
        inventoryValue: `Inventory service valuation using ${valuation.costingMethod}.`,
        inventoryValuationTiming:
          'Current stock snapshot at inventoryAsOf; selected date range applies to period flows, not historical inventory valuation.',
      },
    };
  }

  async getSalesDashboard(businessId: string, filter: DashboardFilterDto) {
    const { range, currency } = await this.context(businessId, filter);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        businessId,
        status: { in: RECOGNIZED_INVOICE_STATUSES },
        issuedDate: { gte: range.startDate, lte: range.endDate },
      },
      include: { customer: true, items: true },
    });
    const ids = invoices.map((invoice) => invoice.id);
    const [returnsToPeriodInvoices, periodReturns, payments] = await Promise.all([
      ids.length
        ? this.prisma.salesReturn.findMany({
            where: {
              businessId,
              invoiceId: { in: ids },
              status: { in: RECOGNIZED_RETURN_STATUSES },
              returnDate: { lte: range.endDate },
            },
          })
        : Promise.resolve([]),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_RETURN_STATUSES },
          returnDate: { gte: range.startDate, lte: range.endDate },
        },
        include: { items: true, invoice: { include: { customer: true } } },
      }),
      ids.length
        ? this.prisma.payment.findMany({
            where: {
              businessId,
              invoiceId: { in: ids },
              status: { in: ACTIVE_PAYMENT_STATUSES },
              paymentDate: { lte: range.endDate },
            },
          })
        : Promise.resolve([]),
    ]);
    const returnByInvoice = this.sumBy(
      returnsToPeriodInvoices,
      (row) => row.invoiceId,
      (row) => row.totalAmount,
    );
    const paidByInvoice = this.sumBy(
      payments,
      (row) => row.invoiceId!,
      (row) => row.amount,
    );
    const periodReturnAmount = periodReturns.reduce((sum, row) => sum + row.totalAmount, 0);
    const periodReturnQuantity = periodReturns.reduce(
      (sum, row) => sum + row.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );
    const revenue = round(
      invoices.reduce((sum, row) => sum + row.totalAmount, 0) - periodReturnAmount,
    );
    const outstanding = round(
      invoices.reduce(
        (sum, invoice) =>
          sum +
          Math.max(
            0,
            invoice.totalAmount -
              (paidByInvoice.get(invoice.id) || 0) -
              (returnByInvoice.get(invoice.id) || 0),
          ),
        0,
      ),
    );
    const totalQuantity = round(
      invoices.reduce(
        (sum, invoice) => sum + invoice.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      ) - periodReturnQuantity,
    );
    const customerRows = new Map<
      string,
      { customerId: string; customerName: string; revenue: number; invoiceCount: number }
    >();
    for (const invoice of invoices) {
      const existing = customerRows.get(invoice.customerId) || {
        customerId: invoice.customerId,
        customerName: invoice.customer.name,
        revenue: 0,
        invoiceCount: 0,
      };
      existing.revenue += invoice.totalAmount - (returnByInvoice.get(invoice.id) || 0);
      existing.invoiceCount += 1;
      customerRows.set(invoice.customerId, existing);
    }
    for (const returned of periodReturns) {
      const customerId = returned.customerId || returned.invoice.customerId;
      const customerName = returned.invoice.customer.name;
      const existing = customerRows.get(customerId) || {
        customerId,
        customerName,
        revenue: 0,
        invoiceCount: 0,
      };
      existing.revenue -= returned.totalAmount;
      customerRows.set(customerId, existing);
    }
    const topCustomers = [...customerRows.values()]
      .sort((a, b) => b.revenue - a.revenue || a.customerName.localeCompare(b.customerName))
      .slice(0, 5);
    return {
      period: range.periodName,
      currency,
      metrics: {
        invoiceCount: invoices.length,
        revenue,
        quantitySold: totalQuantity,
        averageOrderValue: invoices.length ? round(revenue / invoices.length) : 0,
        paidAmount: round([...paidByInvoice.values()].reduce((sum, value) => sum + value, 0)),
        outstandingAmount: outstanding,
        unpaidInvoiceCount: invoices.filter(
          (invoice) =>
            invoice.totalAmount -
              (paidByInvoice.get(invoice.id) || 0) -
              (returnByInvoice.get(invoice.id) || 0) >
            MONEY_EPSILON,
        ).length,
      },
      topCustomers,
    };
  }

  async getOutstandingReceivables(businessId: string) {
    const [business, invoices] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
      this.prisma.salesInvoice.findMany({
        where: { businessId, status: { in: RECOGNIZED_INVOICE_STATUSES } },
        include: {
          customer: { select: { id: true, name: true, customerCode: true } },
          payments: {
            where: { status: { in: ACTIVE_PAYMENT_STATUSES } },
            select: { amount: true },
          },
          returns: {
            where: { status: { in: RECOGNIZED_RETURN_STATUSES } },
            select: { totalAmount: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
      }),
    ]);
    if (!business) throw new NotFoundException('Business not found');
    const asOf = new Date();
    const rows = invoices.flatMap((invoice) => {
      const paid = round(invoice.payments.reduce((sum, payment) => sum + payment.amount, 0));
      const credits = round(invoice.returns.reduce((sum, ret) => sum + ret.totalAmount, 0));
      const balance = round(Math.max(0, invoice.totalAmount - paid - credits));
      if (balance <= MONEY_EPSILON) return [];
      const daysOverdue =
        invoice.dueDate && invoice.dueDate < asOf
          ? Math.floor((asOf.getTime() - invoice.dueDate.getTime()) / 86_400_000)
          : 0;
      return [
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customer.id,
          customerName: invoice.customer.name,
          customerCode: invoice.customer.customerCode,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          totalAmount: invoice.totalAmount,
          totalPaid: paid,
          returnCredits: credits,
          balance,
          daysOverdue,
        },
      ];
    });
    const groups = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        customerCode: string;
        balance: number;
        invoiceCount: number;
        invoices: typeof rows;
      }
    >();
    for (const row of rows) {
      const customer = groups.get(row.customerId) || {
        customerId: row.customerId,
        customerName: row.customerName,
        customerCode: row.customerCode,
        balance: 0,
        invoiceCount: 0,
        invoices: [],
      };
      customer.balance = round(customer.balance + row.balance);
      customer.invoiceCount += 1;
      customer.invoices.push(row);
      groups.set(row.customerId, customer);
    }
    const customers = [...groups.values()].sort(
      (a, b) => b.balance - a.balance || a.customerName.localeCompare(b.customerName),
    );
    return {
      asOf,
      currency: business.currency,
      totalOutstanding: round(rows.reduce((sum, row) => sum + row.balance, 0)),
      invoiceCount: rows.length,
      customerCount: customers.length,
      customers,
    };
  }

  async getInventoryDashboard(businessId: string, filter: DashboardFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    const [valuation, lowStock, movements, products, stockRows] = await Promise.all([
      this.inventory.getStockValuationReport(businessId, { page: 1, limit: 100 }),
      this.inventory.getLowStockReport(businessId, { page: 1, limit: 10, type: 'BOTH' }),
      this.prisma.inventoryMovement.findMany({
        where: {
          businessId,
          createdAt: { gte: range.startDate, lte: range.endDate },
          type: 'SALE',
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      }),
      this.prisma.product.findMany({
        where: { businessId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.stockBalance.findMany({
        where: { location: { businessId } },
        select: { productId: true, locationId: true, quantity: true },
      }),
    ]);
    const topMap = new Map<
      string,
      { productId: string; name: string; sku: string; quantity: number }
    >();
    for (const movement of movements) {
      const row = topMap.get(movement.productId) || {
        productId: movement.productId,
        name: movement.product.name,
        sku: movement.product.sku,
        quantity: 0,
      };
      row.quantity += Math.abs(movement.quantity);
      topMap.set(movement.productId, row);
    }
    return {
      period: range.periodName,
      asOf: new Date(),
      metrics: {
        activeProducts: products.length,
        stockKeepingUnitsWithStock: new Set(
          stockRows.filter((row) => Number(row.quantity) > 0).map((row) => row.productId),
        ).size,
        totalQuantity: round(stockRows.reduce((sum, row) => sum + row.quantity, 0)),
        inventoryValue: valuation.totalValue,
        lowStockCount: lowStock.total,
        locationCount: new Set(stockRows.map((row) => row.locationId)).size,
      },
      costingMethod: valuation.costingMethod,
      lowStockItems: lowStock.data,
      topMovingProducts: [...topMap.values()]
        .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
        .slice(0, 5),
    };
  }

  async getKPIs(businessId: string, filter: KPIFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    const business = await this.businessInfo(businessId);
    return {
      category: filter.category || 'ALL',
      period: range.periodName,
      currency: business.currency,
      kpis: await this.calculateKpis(
        businessId,
        range,
        business.currency,
        filter.category || 'ALL',
      ),
    };
  }

  async getKPIDetail(businessId: string, name: string, filter: KPIFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    const historyRanges = this.kpiHistoryRanges(range);
    const business = await this.businessInfo(businessId);
    const allowed = new Set([
      'Total Revenue',
      'Invoice Count',
      'Average Invoice Value',
      'Units Sold',
      'Cost of Goods Sold',
      'Gross Profit',
      'Recognized Expenses',
      'Net Profit',
      'Net Profit Margin',
      'Inventory Turnover',
      'Outstanding Receivables',
      'Outstanding Payables',
      'Net Cash Position',
      'Revenue Growth',
    ]);
    if (!allowed.has(name)) throw new NotFoundException('KPI not found');
    const history: Array<{ period: string; date: Date; value: number }> = [];
    for (const historyRange of historyRanges) {
      const metrics = await this.calculateKpis(businessId, historyRange, business.currency, 'ALL');
      const point = metrics.find((metric) => metric.name === name);
      if (point)
        history.push({
          period: historyRange.periodName,
          date: historyRange.endDate,
          value: point.value,
        });
    }
    const metric = (await this.calculateKpis(businessId, range, business.currency, 'ALL')).find(
      (item) => item.name === name,
    )!;
    history.push({ period: range.periodName, date: range.endDate, value: metric.value });
    const previous = history[history.length - 2]?.value || 0;
    return {
      ...metric,
      currentValue: metric.value,
      changePercent: percentChange(metric.value, previous),
      history,
      description: metric.formula,
    };
  }

  async analyzeTrends(businessId: string, filter: TrendAnalysisFilterDto) {
    const groupBy = filter.groupBy || 'MONTHLY';
    const range = await this.trendRange(businessId, filter, groupBy, filter.periods || 12);
    const points = await this.series(businessId, filter.metric, range, groupBy);
    const values = points.map((point) => point.value);
    const regression = this.regression(values);
    const projection = Array.from({ length: 3 }, (_, index) => {
      const date = this.addBucket(this.floorBucket(range.endDate, groupBy), groupBy, index + 1);
      return {
        period: this.bucketLabel(date, groupBy),
        date,
        value: round(regression.slope * (values.length + index) + regression.intercept),
      };
    });
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      : 0;
    return {
      metric: filter.metric,
      unit:
        filter.metric === 'SALES_QUANTITY' ||
        filter.metric === 'CUSTOMER_COUNT' ||
        filter.metric === 'INVENTORY'
          ? 'Units'
          : 'Currency',
      startDate: range.startDate,
      endDate: range.endDate,
      groupBy,
      data: points,
      trendLine: { ...regression, projection },
      volatility: round(Math.sqrt(variance)),
      minValue: values.length ? Math.min(...values) : 0,
      maxValue: values.length ? Math.max(...values) : 0,
      averageValue: round(mean),
      forecastConfidence: round(Math.max(0, Math.min(1, regression.rSquared))),
      forecastConfidenceBasis:
        'R-squared of the historical least-squares trend; a fit indicator, not a statistical guarantee.',
    };
  }

  async forecastMetric(businessId: string, filter: ForecastFilterDto) {
    const horizon = filter.periods || 6;
    const range = await this.trendRange(businessId, filter, 'MONTHLY', 24);
    const points = await this.series(businessId, filter.metric, range, 'MONTHLY');
    const values = points.map((point) => point.value);
    if (values.length < 3) {
      throw new BadRequestException(
        'At least three monthly historical periods are required to calculate a forecast',
      );
    }
    const method = filter.method || 'SIMPLE_LINEAR';
    const regression = this.regression(values);
    const fitted = values.map((_, index) => regression.slope * index + regression.intercept);
    const rmse = Math.sqrt(
      values.reduce((sum, value, index) => sum + (value - fitted[index]) ** 2, 0) / values.length,
    );
    let predicted: number[];
    let intervalError = rmse;
    if (method === 'SIMPLE_LINEAR') {
      predicted = Array.from(
        { length: horizon },
        (_, index) => regression.slope * (values.length + index) + regression.intercept,
      );
    } else if (method === 'EXPONENTIAL_SMOOTHING') {
      const alpha = 0.3;
      let level = values[0];
      let residualSquares = 0;
      for (let index = 1; index < values.length; index += 1) {
        residualSquares += (values[index] - level) ** 2;
        level = alpha * values[index] + (1 - alpha) * level;
      }
      predicted = Array(horizon).fill(level);
      if (values.length > 1) intervalError = Math.sqrt(residualSquares / (values.length - 1));
    } else {
      const window = Math.min(3, values.length);
      const sample = values.slice(-window);
      predicted = Array.from({ length: horizon }, () => {
        const moving = sample.reduce((sum, value) => sum + value, 0) / sample.length;
        sample.shift();
        sample.push(moving);
        return moving;
      });
    }
    const allowNegative = filter.metric === 'PROFIT';
    const forecast = predicted.map((raw, index) => {
      const value = allowNegative ? raw : Math.max(0, raw);
      const margin = 1.96 * intervalError * Math.sqrt(index + 1);
      const start = this.floorBucket(range.endDate, 'MONTHLY');
      const date = this.addBucket(start, 'MONTHLY', index + 1);
      return {
        period: this.bucketLabel(date, 'MONTHLY'),
        date,
        predicted: round(value),
        lowConfidence: round(allowNegative ? value - margin : Math.max(0, value - margin)),
        highConfidence: round(allowNegative ? value + margin : Math.max(0, value + margin)),
      };
    });
    const lastActualValue = values[values.length - 1];
    const lastPredicted = forecast[forecast.length - 1]?.predicted ?? lastActualValue;
    return {
      metric: filter.metric,
      method,
      startDate: range.startDate,
      endDate: range.endDate,
      historicalPeriods: points,
      forecast,
      accuracy: null,
      lastActualValue,
      trend: trend(lastPredicted, lastActualValue),
      seasonality: this.detectSeasonality(values),
      confidenceIntervalNote:
        'Approximate 95% interval based on historical residual error; not a guarantee. This model does not adjust for seasonality.',
    };
  }

  async getProductPerformance(businessId: string, filter: ProductPerformanceFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    if (filter.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: filter.categoryId, businessId },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Product category not found');
    }
    const [invoices, returns, movements, stockRows] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: range.startDate, lte: range.endDate },
        },
        include: {
          items: {
            include: {
              product: { include: { category: true } },
            },
          },
        },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_RETURN_STATUSES },
          returnDate: { gte: range.startDate, lte: range.endDate },
        },
        include: { items: true },
      }),
      this.prisma.inventoryMovement.findMany({
        where: {
          businessId,
          createdAt: { gte: range.startDate, lte: range.endDate },
          type: { in: ['SALE', 'SALE_REVERSAL', 'CUSTOMER_RETURN'] },
        },
        include: { product: { select: { buyingPrice: true } } },
      }),
      this.prisma.stockBalance.findMany({ where: { location: { businessId } } }),
    ]);
    type ProductRow = {
      productId: string;
      productName: string;
      productSku: string;
      categoryId: string;
      categoryName: string;
      quantity: number;
      revenue: number;
      cogs: number;
      currentStock: number;
      buyingPrice: number;
    };
    const byProduct = new Map<string, ProductRow>();
    const ensureProduct = (product: any): ProductRow => {
      const row = byProduct.get(product.id) || {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        categoryId: product.categoryId,
        categoryName: product.category?.name || 'Uncategorized',
        quantity: 0,
        revenue: 0,
        cogs: 0,
        currentStock: 0,
        buyingPrice: product.buyingPrice,
      };
      byProduct.set(product.id, row);
      return row;
    };
    for (const invoice of invoices) {
      const lineSubtotal = invoice.items.reduce((sum, item) => sum + Number(item.total || 0), 0);
      // Invoice-level discounts must be allocated to products so product revenue
      // reconciles to net invoice sales instead of overstating the sales mix.
      const invoiceDiscount = Math.min(
        Math.max(0, Number(invoice.discountAmount || 0)),
        lineSubtotal,
      );
      let discountRemaining = round(invoiceDiscount);
      for (const [index, item] of invoice.items.entries()) {
        const row = ensureProduct(item.product);
        row.quantity += item.quantity;
        const itemTotal = Number(item.total || 0);
        const discountShare =
          index === invoice.items.length - 1
            ? discountRemaining
            : lineSubtotal > MONEY_EPSILON
              ? round(invoiceDiscount * (itemTotal / lineSubtotal))
              : 0;
        discountRemaining = round(discountRemaining - discountShare);
        row.revenue += itemTotal - discountShare;
      }
    }
    const returnedProductIds = [
      ...new Set(
        returns.flatMap((customerReturn) => customerReturn.items.map((item) => item.productId)),
      ),
    ];
    const productIds = [...new Set([...byProduct.keys(), ...returnedProductIds])];
    const productMap = productIds.length
      ? new Map(
          (
            await this.prisma.product.findMany({
              where: { businessId, id: { in: productIds } },
              include: { category: true },
            })
          ).map((product) => [product.id, product]),
        )
      : new Map();
    for (const productId of returnedProductIds) {
      const product = productMap.get(productId);
      if (product) ensureProduct(product);
    }
    for (const movement of movements) {
      const product = productMap.get(movement.productId);
      if (!product) continue;
      const row = ensureProduct(product);
      const unitCost = movement.unitCost ?? product.buyingPrice;
      if (movement.type === 'SALE') row.cogs += Math.abs(movement.quantity) * unitCost;
      else row.cogs -= Math.abs(movement.quantity) * unitCost;
    }
    const returnedByProduct = new Map<string, { quantity: number; amount: number }>();
    for (const customerReturn of returns) {
      for (const item of customerReturn.items) {
        const current = returnedByProduct.get(item.productId) || { quantity: 0, amount: 0 };
        current.quantity += item.quantity;
        current.amount += item.total;
        returnedByProduct.set(item.productId, current);
      }
    }
    for (const [id, balance] of byProduct) {
      balance.currentStock = stockRows
        .filter((stock) => stock.productId === id)
        .reduce((sum, stock) => sum + stock.quantity, 0);
      const returned = returnedByProduct.get(id);
      if (returned) {
        balance.quantity -= returned.quantity;
        balance.revenue -= returned.amount;
      }
    }
    const rangeDays = Math.max(
      1,
      Math.ceil((range.endDate.getTime() - range.startDate.getTime() + 1) / 86400000),
    );
    const results = [...byProduct.values()]
      .filter((row) => !filter.categoryId || row.categoryId === filter.categoryId)
      .map((row) => {
        const revenue = round(row.revenue);
        const cogs = round(Math.max(0, row.cogs));
        const profit = round(revenue - cogs);
        const averageStock = Math.max(0, row.currentStock + Math.max(0, row.quantity) / 2);
        const turnover =
          averageStock > MONEY_EPSILON ? round(Math.max(0, row.quantity) / averageStock) : null;
        return {
          productId: row.productId,
          productName: row.productName,
          productSku: row.productSku,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          quantity: round(row.quantity),
          revenue,
          cogs,
          profit,
          marginPercent: revenue > MONEY_EPSILON ? round((profit / revenue) * 100) : 0,
          inventoryTurnover: turnover,
          estimatedDaysOfInventory: turnover && turnover > 0 ? round(rangeDays / turnover) : null,
          unit: 'Units',
        };
      });
    const sortBy = filter.sortBy || 'REVENUE';
    const sortKey: Record<string, keyof (typeof results)[number]> = {
      REVENUE: 'revenue',
      QUANTITY: 'quantity',
      PROFIT: 'profit',
      MARGIN: 'marginPercent',
    };
    results.sort(
      (a, b) =>
        Number(b[sortKey[sortBy]]) - Number(a[sortKey[sortBy]]) ||
        a.productName.localeCompare(b.productName),
    );
    return this.paginate(results, filter.page || 1, filter.limit || 20);
  }

  async getCustomerAnalytics(businessId: string, filter: CustomerAnalyticsFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    const customers = await this.prisma.customer.findMany({
      where: { businessId, isActive: true },
    });
    const [invoices, historicalInvoices, periodReturns] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          businessId,
          customerId: { in: customers.map((customer) => customer.id) },
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: range.startDate, lte: range.endDate },
        },
        select: { customerId: true, totalAmount: true, issuedDate: true },
      }),
      this.prisma.salesInvoice.findMany({
        where: {
          businessId,
          customerId: { in: customers.map((customer) => customer.id) },
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { lte: range.endDate },
        },
        select: { customerId: true, issuedDate: true },
        orderBy: { issuedDate: 'desc' },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_RETURN_STATUSES },
          returnDate: { gte: range.startDate, lte: range.endDate },
          invoice: { customerId: { in: customers.map((customer) => customer.id) } },
        },
        include: { invoice: { select: { customerId: true } } },
      }),
    ]);
    const byCustomer = new Map<string, { revenue: number; count: number; latest: Date | null }>();
    for (const invoice of historicalInvoices) {
      const state = byCustomer.get(invoice.customerId) || {
        revenue: 0,
        count: 0,
        latest: invoice.issuedDate,
      };
      if (invoice.issuedDate && (!state.latest || invoice.issuedDate > state.latest))
        state.latest = invoice.issuedDate;
      byCustomer.set(invoice.customerId, state);
    }
    for (const invoice of invoices) {
      const state = byCustomer.get(invoice.customerId) || { revenue: 0, count: 0, latest: null };
      state.revenue += invoice.totalAmount;
      state.count += 1;
      byCustomer.set(invoice.customerId, state);
    }
    for (const returned of periodReturns) {
      const customerId = returned.customerId || returned.invoice.customerId;
      const state = byCustomer.get(customerId) || { revenue: 0, count: 0, latest: null };
      state.revenue -= returned.totalAmount;
      byCustomer.set(customerId, state);
    }
    const revenueRanks = [...byCustomer.values()].map((row) => row.revenue).sort((a, b) => a - b);
    const countRanks = [...byCustomer.values()].map((row) => row.count).sort((a, b) => a - b);
    const now = range.endDate;
    const segments = customers.flatMap((customer) => {
      const state = byCustomer.get(customer.id);
      const totalRevenue = round(state?.revenue || 0);
      const transactionCount = state?.count || 0;
      const lastTransactionDate = state?.latest || null;
      const daysInactive = lastTransactionDate
        ? Math.max(0, Math.floor((now.getTime() - lastTransactionDate.getTime()) / 86400000))
        : null;
      const spendPercentile = this.percentile(revenueRanks, totalRevenue);
      const frequencyPercentile = this.percentile(countRanks, transactionCount);
      const recencyScore =
        daysInactive === null ? 0 : Math.max(0, 100 - (daysInactive / 180) * 100);
      const loyaltyScore = round(
        spendPercentile * 0.5 + frequencyPercentile * 0.3 + recencyScore * 0.2,
      );
      const segment =
        daysInactive === null || daysInactive > 180
          ? 'INACTIVE'
          : daysInactive > 90
            ? 'AT_RISK'
            : loyaltyScore >= 80
              ? 'VIP'
              : 'REGULAR';
      return [
        {
          customerId: customer.id,
          customerName: customer.name,
          customerCode: customer.customerCode,
          customerType: customer.customerType,
          totalRevenue,
          transactionCount,
          averageOrderValue: transactionCount ? round(totalRevenue / transactionCount) : 0,
          lastTransactionDate,
          daysInactive,
          loyaltyScore,
          segment,
        },
      ];
    });
    const field: Record<string, (item: (typeof segments)[number]) => number> = {
      REVENUE: (item) => item.totalRevenue,
      FREQUENCY: (item) => item.transactionCount,
      LOYALTY: (item) => item.loyaltyScore,
      RECENCY: (item) => -(item.daysInactive ?? Number.MAX_SAFE_INTEGER),
    };
    const sort = field[filter.segmentBy || 'REVENUE'];
    segments.sort((a, b) => sort(b) - sort(a) || a.customerName.localeCompare(b.customerName));
    return this.paginate(segments, filter.page || 1, filter.limit || 20);
  }

  async getSupplierAnalytics(businessId: string, filter: SupplierAnalyticsFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    const suppliers = await this.prisma.supplier.findMany({
      where: { businessId, isActive: true },
      include: {
        purchaseOrders: {
          where: {
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            orderDate: { gte: range.startDate, lte: range.endDate },
          },
          include: {
            grns: {
              where: { status: 'ACCEPTED', receivedDate: { lte: range.endDate } },
              include: { items: { include: { purchaseOrderItem: true } } },
            },
          },
        },
      },
    });
    const results = suppliers
      .flatMap((supplier) => {
        const orders = supplier.purchaseOrders;
        if (!orders.length) return [];
        let acceptedQty = 0;
        let rejectedQty = 0;
        let damagedQty = 0;
        let purchaseValue = 0;
        let onTimeQty = 0;
        const leadTimes: number[] = [];
        for (const order of orders) {
          const grns = order.grns.sort(
            (a, b) => a.receivedDate.getTime() - b.receivedDate.getTime(),
          );
          if (grns.length) {
            const first = grns[0];
            leadTimes.push(
              Math.max(
                0,
                Math.floor((first.receivedDate.getTime() - order.orderDate.getTime()) / 86400000),
              ),
            );
          }
          for (const grn of grns) {
            for (const item of grn.items) {
              acceptedQty += item.acceptedQuantity;
              rejectedQty += item.rejectedQuantity;
              damagedQty += item.damageQuantity;
              purchaseValue += item.acceptedQuantity * item.purchaseOrderItem.unitPrice;
              if (!order.expectedDeliveryDate || grn.receivedDate <= order.expectedDeliveryDate)
                onTimeQty += item.acceptedQuantity;
            }
          }
        }
        const inspectedQty = acceptedQty + rejectedQty + damagedQty;
        const onTimeDeliveryPercent = acceptedQty ? round((onTimeQty / acceptedQty) * 100) : null;
        const qualityScore = inspectedQty ? round((acceptedQty / inspectedQty) * 100) : null;
        const riskLevel =
          inspectedQty === 0
            ? 'UNKNOWN'
            : (onTimeDeliveryPercent !== null && onTimeDeliveryPercent < 70) ||
                (qualityScore !== null && qualityScore < 85)
              ? 'HIGH'
              : (onTimeDeliveryPercent !== null && onTimeDeliveryPercent < 90) ||
                  (qualityScore !== null && qualityScore < 95)
                ? 'MEDIUM'
                : 'LOW';
        return [
          {
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierCode: supplier.supplierCode,
            purchaseOrderCount: orders.length,
            acceptedPurchaseValue: round(purchaseValue),
            acceptedQuantity: round(acceptedQty),
            rejectedQuantity: round(rejectedQty),
            damagedQuantity: round(damagedQty),
            onTimeDeliveryPercent,
            qualityScore,
            averageLeadTimeDays: leadTimes.length
              ? round(leadTimes.reduce((sum, days) => sum + days, 0) / leadTimes.length)
              : null,
            riskLevel,
            dataCoverage: inspectedQty ? 'GRN measured' : 'No accepted GRN in selected period',
          },
        ];
      })
      .sort(
        (a, b) =>
          (b.acceptedPurchaseValue || 0) - (a.acceptedPurchaseValue || 0) ||
          a.supplierName.localeCompare(b.supplierName),
      );
    return this.paginate(results, filter.page || 1, filter.limit || 20);
  }

  async getSalesByChannel(businessId: string, filter: SalesByChannelFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    const previousRange = this.previousRange(range);
    const channelBy = filter.channelBy || 'LOCATION';
    const [current, previous] = await Promise.all([
      this.aggregateChannels(businessId, range, channelBy),
      this.aggregateChannels(businessId, previousRange, channelBy),
    ]);
    const previousByKey = new Map(previous.map((item) => [item.channelId, item]));
    return current
      .map((item) => {
        const prior = previousByKey.get(item.channelId);
        return {
          ...item,
          averageOrderValue: item.transactionCount
            ? round(item.revenue / item.transactionCount)
            : 0,
          marginPercent:
            item.revenue > MONEY_EPSILON ? round((item.profit / item.revenue) * 100) : 0,
          growthRate: percentChange(item.revenue, prior?.revenue || 0),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || a.channel.localeCompare(b.channel));
  }

  async getExpenseBreakdown(businessId: string, filter: DashboardFilterDto) {
    const range = await this.getDateRange(businessId, filter);
    const previousRange = this.previousRange(range);
    const [current, previous, categories] = await Promise.all([
      this.expenseTotalsByCategory(businessId, range),
      this.expenseTotalsByCategory(businessId, previousRange),
      this.prisma.expenseCategory.findMany({ where: { businessId } }),
    ]);
    const previousById = new Map(previous.map((row) => [row.categoryId, row.amount]));
    const budgetById = new Map<string, number>();
    for (const category of categories) {
      if (category.budgetLimit == null || !category.budgetPeriod) continue;
      const periods = this.budgetWindows(range, category.budgetPeriod);
      budgetById.set(category.id, round(category.budgetLimit * periods));
    }
    const total = round(current.reduce((sum, item) => sum + item.amount, 0));
    return current
      .map((item) => {
        const budget = budgetById.get(item.categoryId);
        const variance = budget === undefined ? null : round(item.amount - budget);
        const prior = previousById.get(item.categoryId) || 0;
        return {
          categoryId: item.categoryId,
          category: item.categoryName,
          amount: item.amount,
          percentage: total ? round((item.amount / total) * 100) : 0,
          budget,
          variance,
          variancePercent:
            budget && budget > 0 && variance !== null ? round((variance / budget) * 100) : null,
          previousAmount: round(prior),
          changePercent: percentChange(item.amount, prior),
          trend: trend(item.amount, prior),
        };
      })
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  }

  async comparePeriods(businessId: string, filter: ComparisonFilterDto) {
    const [first, second] = await this.comparisonRanges(businessId, filter);
    const [a, b] = await Promise.all([
      this.payments.getIncomeStatement(businessId, this.asFinancialFilter(first)),
      this.payments.getIncomeStatement(businessId, this.asFinancialFilter(second)),
    ]);
    const metrics = [
      { metric: 'Revenue', first: a.revenue, second: b.revenue, unit: 'Currency' },
      {
        metric: 'Cost of goods sold',
        first: a.costOfGoodsSold,
        second: b.costOfGoodsSold,
        unit: 'Currency',
      },
      { metric: 'Gross profit', first: a.grossProfit, second: b.grossProfit, unit: 'Currency' },
      {
        metric: 'Recognized expenses',
        first: a.operatingExpenses,
        second: b.operatingExpenses,
        unit: 'Currency',
      },
      { metric: 'Net profit', first: a.netIncome, second: b.netIncome, unit: 'Currency' },
      {
        metric: 'Net margin',
        first: a.netMarginPercentage,
        second: b.netMarginPercentage,
        unit: '%',
      },
    ];
    return {
      period1: first.periodName,
      period2: second.periodName,
      data: metrics.map((item) => {
        const difference = round(item.second - item.first);
        return {
          metric: item.metric,
          unit: item.unit,
          period1Value: round(item.first),
          period2Value: round(item.second),
          difference,
          percentChange: percentChange(item.second, item.first),
          status:
            trend(item.second, item.first) === 'UP'
              ? 'INCREASED'
              : trend(item.second, item.first) === 'DOWN'
                ? 'DECREASED'
                : 'NO_CHANGE',
        };
      }),
    };
  }

  async exportReport(businessId: string, filter: ExportFilterDto) {
    const common = {
      periodId: filter.periodId,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      groupBy: filter.groupBy,
    };
    let report: unknown;
    switch (filter.reportType) {
      case 'DASHBOARD':
        report = await this.getExecutiveDashboard(businessId, common);
        break;
      case 'SALES_DASHBOARD':
        report = await this.getSalesDashboard(businessId, common);
        break;
      case 'INVENTORY_DASHBOARD':
        report = await this.getInventoryDashboard(businessId, common);
        break;
      case 'INCOME_STATEMENT':
        report = await this.payments.getIncomeStatement(
          businessId,
          this.asFinancialFilter(await this.getDateRange(businessId, filter)),
        );
        break;
      case 'CASH_FLOW':
        report = await this.payments.getCashFlowReport(
          businessId,
          this.asFinancialFilter(await this.getDateRange(businessId, filter)),
        );
        break;
      case 'RECEIVABLES_AGEING': {
        const range = await this.getDateRange(businessId, filter);
        report = await this.payments.getReceivablesAgeingReport(businessId, {
          dateAs: range.endDate.toISOString(),
        });
        break;
      }
      case 'PAYABLES_AGEING': {
        const range = await this.getDateRange(businessId, filter);
        report = await this.payments.getPayablesAgeingReport(businessId, {
          dateAs: range.endDate.toISOString(),
        });
        break;
      }
      case 'KPI':
        report = await this.getKPIs(businessId, { ...common, category: filter.category });
        break;
      case 'PRODUCT_PERFORMANCE': {
        const productReport = await this.getProductPerformance(businessId, {
          ...common,
          page: 1,
          limit: 10000,
        });
        if (productReport.total > 10000)
          throw new BadRequestException(
            'Product export exceeds 10,000 rows; narrow the date range',
          );
        report = productReport;
        break;
      }
      case 'CUSTOMER_ANALYTICS': {
        const customerReport = await this.getCustomerAnalytics(businessId, {
          ...common,
          page: 1,
          limit: 10000,
        });
        if (customerReport.total > 10000)
          throw new BadRequestException(
            'Customer export exceeds 10,000 rows; narrow the date range',
          );
        report = customerReport;
        break;
      }
      case 'SUPPLIER_ANALYTICS': {
        const supplierReport = await this.getSupplierAnalytics(businessId, {
          ...common,
          page: 1,
          limit: 10000,
        });
        if (supplierReport.total > 10000)
          throw new BadRequestException(
            'Supplier export exceeds 10,000 rows; narrow the date range',
          );
        report = supplierReport;
        break;
      }
      case 'SALES_BY_CHANNEL':
        report = await this.getSalesByChannel(businessId, common);
        break;
      case 'EXPENSE_BREAKDOWN':
        report = await this.getExpenseBreakdown(businessId, common);
        break;
      default:
        throw new BadRequestException('Unsupported report type');
    }
    const extension = filter.format === 'EXCEL' ? 'xlsx' : filter.format.toLowerCase();
    const contentType =
      filter.format === 'JSON'
        ? 'application/json; charset=utf-8'
        : filter.format === 'EXCEL'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : filter.format === 'PDF'
            ? 'application/pdf'
            : 'text/csv; charset=utf-8';
    const baseName =
      (
        filter.fileName ||
        `${filter.reportType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`
      )
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^[.-]+|[.-]+$/g, '')
        .slice(0, 100) || 'analytics-report';
    const fileName = baseName.toLowerCase().endsWith(`.${extension}`)
      ? baseName
      : `${baseName}.${extension}`;
    const content =
      filter.format === 'JSON'
        ? JSON.stringify(report, null, 2)
        : filter.format === 'EXCEL'
          ? this.toXlsx(report)
          : filter.format === 'PDF'
            ? this.toPdf(report, filter.reportType)
            : this.toCsv(report);
    return {
      fileName,
      contentType,
      content,
      generatedAt: new Date(),
      format: filter.format,
      reportType: filter.reportType,
    };
  }

  async recordReportAccess(
    businessId: string,
    userId: string,
    reportName: string,
    filter: unknown,
    resultSummary?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        entityType: 'AnalyticsReport',
        entityId: reportName,
        action: 'VIEW',
        beforeData: null,
        afterData: JSON.stringify({ filter, ...resultSummary }),
        description: `Viewed analytics report: ${reportName}`,
      },
    });
  }

  private async context(businessId: string, filter: PeriodFilterDto): Promise<ReportContext> {
    const [range, business] = await Promise.all([
      this.getDateRange(businessId, filter),
      this.businessInfo(businessId),
    ]);
    return { range, currency: business.currency };
  }

  private async businessInfo(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, currency: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  private async getDateRange(businessId: string, filter: PeriodFilterDto): Promise<DateRange> {
    if (filter.periodId && (filter.dateFrom || filter.dateTo)) {
      throw new BadRequestException('Use periodId or dateFrom/dateTo, not both');
    }
    if (filter.periodId) {
      const period = await this.prisma.accountingPeriod.findFirst({
        where: { id: filter.periodId, businessId },
      });
      if (!period) throw new NotFoundException('Accounting period not found');
      return { startDate: period.startDate, endDate: period.endDate, periodName: period.period };
    }
    const now = new Date();
    const startDate = filter.dateFrom
      ? this.parseStart(filter.dateFrom)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endDate = filter.dateTo ? this.parseEnd(filter.dateTo) : now;
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      startDate > endDate
    ) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }
    return {
      startDate,
      endDate,
      periodName: `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
    };
  }

  private async trendRange(
    businessId: string,
    filter: PeriodFilterDto,
    groupBy: AnalyticsGroup,
    defaultPeriods: number,
  ): Promise<DateRange> {
    if (filter.periodId || filter.dateFrom || filter.dateTo)
      return this.getDateRange(businessId, filter);
    const end = new Date();
    const currentBucket = this.floorBucket(end, groupBy);
    const start = this.addBucket(currentBucket, groupBy, -(defaultPeriods - 1));
    return {
      startDate: start,
      endDate: end,
      periodName: `${this.bucketLabel(start, groupBy)} to ${this.bucketLabel(currentBucket, groupBy)}`,
    };
  }

  private parseStart(input: string) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
    const parsed = dateOnly ? new Date(`${input}T00:00:00.000Z`) : new Date(input);
    if (
      !Number.isFinite(parsed.getTime()) ||
      (dateOnly && parsed.toISOString().slice(0, 10) !== input)
    ) {
      throw new BadRequestException('dateFrom must be a valid date');
    }
    return parsed;
  }

  private parseEnd(input: string) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
    const parsed = dateOnly ? new Date(`${input}T23:59:59.999Z`) : new Date(input);
    if (
      !Number.isFinite(parsed.getTime()) ||
      (dateOnly && parsed.toISOString().slice(0, 10) !== input)
    ) {
      throw new BadRequestException('dateTo must be a valid date');
    }
    return parsed;
  }

  private previousRange(range: DateRange): DateRange {
    const duration = range.endDate.getTime() - range.startDate.getTime() + 1;
    const endDate = new Date(range.startDate.getTime() - 1);
    const startDate = new Date(endDate.getTime() - duration + 1);
    return {
      startDate,
      endDate,
      periodName: `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
    };
  }

  private asFinancialFilter(range: DateRange) {
    return { dateFrom: range.startDate.toISOString(), dateTo: range.endDate.toISOString() };
  }

  private financialGroup(groupBy: AnalyticsGroup): 'DAILY' | 'WEEKLY' | 'MONTHLY' {
    return groupBy === 'DAILY' || groupBy === 'WEEKLY' ? groupBy : 'MONTHLY';
  }

  private metric(
    name: string,
    value: number,
    unit: string,
    previousValue: number,
    formula?: string,
  ) {
    const changePercent = percentChange(value, previousValue);
    const direction = trend(value, previousValue);
    const status =
      name.toLowerCase().includes('profit') && value < 0
        ? 'CRITICAL'
        : Math.abs(value) < MONEY_EPSILON
          ? 'WARNING'
          : 'GOOD';
    return {
      name,
      label: name,
      value: round(value),
      unit,
      previousValue: round(previousValue),
      changePercent,
      trend: direction,
      status,
      ...(formula ? { formula } : {}),
    };
  }

  private async calculateKpis(
    businessId: string,
    range: DateRange,
    currency: string,
    category: KPIFilterDto['category'] | string,
  ) {
    const previousRange = this.previousRange(range);
    const [
      statement,
      previousStatement,
      balance,
      previousBalance,
      valuation,
      invoiceCount,
      previousInvoiceCount,
      soldQuantity,
    ] = await Promise.all([
      this.payments.getIncomeStatement(businessId, this.asFinancialFilter(range)),
      this.payments.getIncomeStatement(businessId, this.asFinancialFilter(previousRange)),
      this.payments.getFinancialSummary(businessId, { dateAs: range.endDate.toISOString() }),
      this.payments.getFinancialSummary(businessId, {
        dateAs: previousRange.endDate.toISOString(),
      }),
      this.inventory.getStockValuationReport(businessId, { page: 1, limit: 100 }),
      this.prisma.salesInvoice.count({
        where: {
          businessId,
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: range.startDate, lte: range.endDate },
        },
      }),
      this.prisma.salesInvoice.count({
        where: {
          businessId,
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: previousRange.startDate, lte: previousRange.endDate },
        },
      }),
      Promise.all([
        this.series(businessId, 'SALES_QUANTITY', range, 'MONTHLY'),
        this.series(businessId, 'SALES_QUANTITY', previousRange, 'MONTHLY'),
      ]),
    ]);
    const sold = round(soldQuantity[0].reduce((sum, point) => sum + point.value, 0));
    const previousSold = round(soldQuantity[1].reduce((sum, point) => sum + point.value, 0));
    const grossProfit = round(statement.revenue - statement.costOfGoodsSold);
    const previousGross = round(previousStatement.revenue - previousStatement.costOfGoodsSold);
    const inventoryTurnover =
      valuation.totalValue > MONEY_EPSILON
        ? round(statement.costOfGoodsSold / valuation.totalValue)
        : 0;
    const previousInventoryTurnover =
      valuation.totalValue > MONEY_EPSILON
        ? round(previousStatement.costOfGoodsSold / valuation.totalValue)
        : 0;
    const all = [
      this.metric(
        'Total Revenue',
        statement.revenue,
        currency,
        previousStatement.revenue,
        'Issued invoice totals less received/completed customer returns in the date range.',
      ),
      this.metric(
        'Invoice Count',
        invoiceCount,
        'Invoices',
        previousInvoiceCount,
        'Count of non-draft, non-cancelled invoices by issued date.',
      ),
      this.metric(
        'Average Invoice Value',
        invoiceCount ? statement.revenue / invoiceCount : 0,
        currency,
        previousInvoiceCount ? previousStatement.revenue / previousInvoiceCount : 0,
        'Net revenue divided by issued invoice count.',
      ),
      this.metric(
        'Units Sold',
        sold,
        'Units',
        previousSold,
        'Issued invoice quantities less accepted return quantities.',
      ),
      this.metric(
        'Cost of Goods Sold',
        statement.costOfGoodsSold,
        currency,
        previousStatement.costOfGoodsSold,
        'Cost from inventory sale/reversal movements in the selected period.',
      ),
      this.metric(
        'Gross Profit',
        grossProfit,
        currency,
        previousGross,
        'Net revenue less cost of goods sold.',
      ),
      this.metric(
        'Recognized Expenses',
        statement.operatingExpenses,
        currency,
        previousStatement.operatingExpenses,
        'Approved and paid expenses by expense date.',
      ),
      this.metric(
        'Net Profit',
        statement.netIncome,
        currency,
        previousStatement.netIncome,
        'Net revenue less cost of goods sold and recognized expenses.',
      ),
      this.metric(
        'Net Profit Margin',
        statement.netMarginPercentage,
        '%',
        previousStatement.netMarginPercentage,
        'Net profit divided by revenue.',
      ),
      this.metric(
        'Inventory Turnover',
        inventoryTurnover,
        'Times',
        previousInventoryTurnover,
        'Period COGS divided by current inventory value; an operational proxy, not average-inventory accounting turnover.',
      ),
      this.metric(
        'Outstanding Receivables',
        balance.totalReceivables,
        currency,
        previousBalance.totalReceivables,
        'Open issued sales invoices as of period end.',
      ),
      this.metric(
        'Outstanding Payables',
        balance.totalPayables,
        currency,
        previousBalance.totalPayables,
        'Open non-draft purchase orders as of period end.',
      ),
      this.metric(
        'Net Cash Position',
        balance.cashOnHand,
        currency,
        previousBalance.cashOnHand,
        'Cumulative active payment-ledger inflows less outflows as of period end.',
      ),
      this.metric(
        'Revenue Growth',
        percentChange(statement.revenue, previousStatement.revenue) || 0,
        '%',
        0,
        'Percent change against the immediately preceding range of equal duration.',
      ),
    ];
    if (!category || category === 'ALL') return all;
    const groups: Record<string, string[]> = {
      SALES: ['Total Revenue', 'Invoice Count', 'Average Invoice Value', 'Units Sold'],
      PROFITABILITY: [
        'Cost of Goods Sold',
        'Gross Profit',
        'Recognized Expenses',
        'Net Profit',
        'Net Profit Margin',
      ],
      EFFICIENCY: ['Inventory Turnover', 'Units Sold'],
      LIQUIDITY: ['Outstanding Receivables', 'Outstanding Payables', 'Net Cash Position'],
      GROWTH: ['Revenue Growth'],
    };
    return all.filter((item) => groups[category]?.includes(item.name));
  }

  private kpiHistoryRanges(current: DateRange): DateRange[] {
    const duration = current.endDate.getTime() - current.startDate.getTime() + 1;
    return Array.from({ length: 11 }, (_, index) => {
      const periodsBack = 11 - index;
      const startDate = new Date(current.startDate.getTime() - duration * periodsBack);
      const endDate = new Date(current.startDate.getTime() - duration * (periodsBack - 1) - 1);
      return {
        startDate,
        endDate,
        periodName: `${startDate.toISOString()} to ${endDate.toISOString()}`,
      };
    });
  }

  private async series(
    businessId: string,
    metric: string,
    range: DateRange,
    groupBy: AnalyticsGroup,
  ): Promise<TrendPoint[]> {
    const buckets = this.buckets(range, groupBy);
    if (!buckets.length) return [];
    const [invoices, returns, expenses, movements, stockRows] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: range.startDate, lte: range.endDate },
        },
        include: { items: metric === 'SALES_QUANTITY' ? true : false },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_RETURN_STATUSES },
          returnDate: { gte: range.startDate, lte: range.endDate },
        },
        include: { items: metric === 'SALES_QUANTITY' ? true : false },
      }),
      this.prisma.expense.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_EXPENSE_STATUSES },
          expenseDate: { gte: range.startDate, lte: range.endDate },
        },
        select: { amount: true, expenseDate: true },
      }),
      this.prisma.inventoryMovement.findMany({
        where: { businessId, createdAt: { gte: buckets[0].start, lte: new Date() } },
        include: { product: { select: { buyingPrice: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      metric === 'INVENTORY'
        ? this.prisma.stockBalance.findMany({ where: { location: { businessId } } })
        : Promise.resolve([]),
    ]);
    const values = new Map(buckets.map((bucket) => [this.bucketLabel(bucket.start, groupBy), 0]));
    const bucketFor = (date: Date) => this.bucketLabel(this.floorBucket(date, groupBy), groupBy);
    if (metric === 'REVENUE' || metric === 'PROFIT' || metric === 'CUSTOMER_COUNT') {
      for (const invoice of invoices) {
        if (!invoice.issuedDate) continue;
        const key = bucketFor(invoice.issuedDate);
        if (!values.has(key)) continue;
        if (metric !== 'CUSTOMER_COUNT') values.set(key, values.get(key)! + invoice.totalAmount);
      }
      if (metric === 'CUSTOMER_COUNT') {
        for (const bucket of buckets) {
          const key = this.bucketLabel(bucket.start, groupBy);
          const customers = new Set(
            invoices
              .filter((row) => row.issuedDate && bucketFor(row.issuedDate) === key)
              .map((row) => row.customerId),
          );
          values.set(key, customers.size);
        }
      } else {
        for (const item of returns) {
          const key = bucketFor(item.returnDate);
          if (values.has(key)) values.set(key, values.get(key)! - item.totalAmount);
        }
      }
    }
    if (metric === 'EXPENSES' || metric === 'PROFIT') {
      for (const expense of expenses) {
        const key = bucketFor(expense.expenseDate);
        if (values.has(key)) {
          const sign = metric === 'PROFIT' ? -1 : 1;
          values.set(key, values.get(key)! + expense.amount * sign);
        }
      }
    }
    if (metric === 'SALES_QUANTITY') {
      for (const invoice of invoices) {
        const key = invoice.issuedDate && bucketFor(invoice.issuedDate);
        if (key && values.has(key))
          values.set(
            key,
            values.get(key)! + invoice.items.reduce((sum, item) => sum + item.quantity, 0),
          );
      }
      for (const item of returns) {
        const key = bucketFor(item.returnDate);
        if (values.has(key))
          values.set(
            key,
            values.get(key)! - item.items.reduce((sum, line) => sum + line.quantity, 0),
          );
      }
    }
    if (metric === 'PROFIT') {
      for (const movement of movements) {
        if (!['SALE', 'SALE_REVERSAL', 'CUSTOMER_RETURN'].includes(movement.type)) continue;
        const key = bucketFor(movement.createdAt);
        if (!values.has(key)) continue;
        const signedCogs =
          Math.abs(movement.quantity) *
          (movement.unitCost ?? movement.product.buyingPrice) *
          (movement.type === 'SALE' ? 1 : -1);
        values.set(key, values.get(key)! - signedCogs);
      }
    }
    if (metric === 'INVENTORY') {
      const currentQty = stockRows.reduce((sum, row) => sum + row.quantity, 0);
      for (const bucket of buckets) {
        const laterDelta = movements
          .filter((movement) => movement.createdAt > bucket.end)
          .reduce((sum, movement) => sum + movement.quantity, 0);
        values.set(this.bucketLabel(bucket.start, groupBy), round(currentQty - laterDelta));
      }
    }
    let prior: number | null = null;
    const ordered = buckets.map((bucket) => {
      const label = this.bucketLabel(bucket.start, groupBy);
      const value = round(values.get(label) || 0);
      const point: TrendPoint = {
        period: label,
        date: bucket.end,
        value,
        percentChange: prior === null ? null : percentChange(value, prior),
        movingAverage: 0,
      };
      prior = value;
      return point;
    });
    return ordered.map((point, index) => ({
      ...point,
      movingAverage: round(
        ordered
          .slice(Math.max(0, index - 2), index + 1)
          .reduce((sum, current) => sum + current.value, 0) / Math.min(3, index + 1),
      ),
    }));
  }

  private buckets(range: DateRange, groupBy: AnalyticsGroup) {
    const buckets: Array<{ start: Date; end: Date }> = [];
    let current = this.floorBucket(range.startDate, groupBy);
    const final = this.floorBucket(range.endDate, groupBy);
    while (current <= final && buckets.length < 120) {
      const next = this.addBucket(current, groupBy, 1);
      buckets.push({ start: current, end: new Date(next.getTime() - 1) });
      current = next;
    }
    return buckets;
  }

  private floorBucket(date: Date, groupBy: AnalyticsGroup) {
    const bucket = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    if (groupBy === 'DAILY') return bucket;
    if (groupBy === 'WEEKLY') {
      bucket.setUTCDate(bucket.getUTCDate() - ((bucket.getUTCDay() + 6) % 7));
      return bucket;
    }
    if (groupBy === 'MONTHLY')
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    if (groupBy === 'QUARTERLY')
      return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  }

  private addBucket(date: Date, groupBy: AnalyticsGroup, amount: number) {
    const next = new Date(date);
    if (groupBy === 'DAILY') next.setUTCDate(next.getUTCDate() + amount);
    else if (groupBy === 'WEEKLY') next.setUTCDate(next.getUTCDate() + amount * 7);
    else if (groupBy === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + amount);
    else if (groupBy === 'QUARTERLY') next.setUTCMonth(next.getUTCMonth() + amount * 3);
    else next.setUTCFullYear(next.getUTCFullYear() + amount);
    return next;
  }

  private bucketLabel(date: Date, groupBy: AnalyticsGroup) {
    if (groupBy === 'DAILY' || groupBy === 'WEEKLY') return date.toISOString().slice(0, 10);
    if (groupBy === 'MONTHLY') return date.toISOString().slice(0, 7);
    if (groupBy === 'QUARTERLY')
      return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    return String(date.getUTCFullYear());
  }

  private regression(values: number[]) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((sum, value) => sum + value, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < n; index += 1) {
      numerator += (index - meanX) * (values[index] - meanY);
      denominator += (index - meanX) ** 2;
    }
    const slope = denominator ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;
    const total = values.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
    const residual = values.reduce(
      (sum, value, index) => sum + (value - (slope * index + intercept)) ** 2,
      0,
    );
    const rSquared =
      total <= MONEY_EPSILON
        ? residual <= MONEY_EPSILON
          ? 1
          : 0
        : Math.max(0, Math.min(1, 1 - residual / total));
    return { slope: round(slope), intercept: round(intercept), rSquared: round(rSquared) };
  }

  private detectSeasonality(values: number[]) {
    if (values.length < 24) return false;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const denominator = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
    if (denominator <= MONEY_EPSILON) return false;
    const lag = 12;
    const covariance = values
      .slice(lag)
      .reduce((sum, value, index) => sum + (value - mean) * (values[index] - mean), 0);
    return covariance / denominator > 0.5;
  }

  private async comparisonRanges(
    businessId: string,
    filter: ComparisonFilterDto,
  ): Promise<[DateRange, DateRange]> {
    const ids = Boolean(filter.period1Id || filter.period2Id);
    const dates = Boolean(filter.dateFrom1 || filter.dateTo1 || filter.dateFrom2 || filter.dateTo2);
    if (ids === dates)
      throw new BadRequestException('Provide either both period IDs or two complete date ranges');
    if (ids) {
      if (!filter.period1Id || !filter.period2Id)
        throw new BadRequestException('Both period1Id and period2Id are required');
      const [first, second] = await Promise.all([
        this.prisma.accountingPeriod.findFirst({ where: { id: filter.period1Id, businessId } }),
        this.prisma.accountingPeriod.findFirst({ where: { id: filter.period2Id, businessId } }),
      ]);
      if (!first || !second) throw new NotFoundException('Accounting period not found');
      return [
        { startDate: first.startDate, endDate: first.endDate, periodName: first.period },
        { startDate: second.startDate, endDate: second.endDate, periodName: second.period },
      ];
    }
    if (!filter.dateFrom1 || !filter.dateTo1 || !filter.dateFrom2 || !filter.dateTo2) {
      throw new BadRequestException('Both comparison date ranges need dateFrom and dateTo');
    }
    const [first, second] = await Promise.all([
      this.getDateRange(businessId, { dateFrom: filter.dateFrom1, dateTo: filter.dateTo1 }),
      this.getDateRange(businessId, { dateFrom: filter.dateFrom2, dateTo: filter.dateTo2 }),
    ]);
    return [first, second];
  }

  private async aggregateChannels(
    businessId: string,
    range: DateRange,
    channelBy: 'LOCATION' | 'SALESPERSON' | 'CUSTOMER_TYPE',
  ) {
    const [invoices, returns] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_INVOICE_STATUSES },
          issuedDate: { gte: range.startDate, lte: range.endDate },
        },
        include: { location: true, customer: true, items: true },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          status: { in: RECOGNIZED_RETURN_STATUSES },
          returnDate: { gte: range.startDate, lte: range.endDate },
        },
        include: {
          items: true,
          invoice: { include: { location: true, customer: true, items: true } },
        },
      }),
    ]);
    if (!invoices.length && !returns.length) return [];
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const relatedInvoices = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    for (const returned of returns) relatedInvoices.set(returned.invoiceId, returned.invoice);
    const userIds = [
      ...new Set(
        [...relatedInvoices.values()]
          .map((invoice) => invoice.salespersonId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds }, businessId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const userNames = new Map(
      users.map((user) => [user.id, [user.firstName, user.lastName].filter(Boolean).join(' ')]),
    );
    const invoiceToChannel = new Map<string, { id: string; name: string }>();
    for (const invoice of relatedInvoices.values()) {
      let id: string;
      let name: string;
      if (channelBy === 'LOCATION') {
        id = invoice.locationId;
        name = invoice.location.name;
      } else if (channelBy === 'CUSTOMER_TYPE') {
        id = invoice.customer.customerType || 'UNKNOWN';
        name = id;
      } else {
        id = invoice.salespersonId || 'UNASSIGNED';
        name = invoice.salespersonId
          ? userNames.get(invoice.salespersonId) || 'Unknown salesperson'
          : 'Unassigned';
      }
      invoiceToChannel.set(invoice.id, { id, name });
    }
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        createdAt: { gte: range.startDate, lte: range.endDate },
        OR: [
          { referenceType: 'SalesInvoice', referenceId: { in: invoiceIds } },
          { referenceType: 'SalesReturn', referenceId: { in: returns.map((item) => item.id) } },
        ],
        type: { in: ['SALE', 'SALE_REVERSAL', 'CUSTOMER_RETURN'] },
      },
      include: { product: { select: { buyingPrice: true } } },
    });
    const returnToInvoice = new Map(returns.map((item) => [item.id, item.invoiceId]));
    const grouped = new Map<
      string,
      {
        channelId: string;
        channel: string;
        revenue: number;
        quantity: number;
        profit: number;
        transactionCount: number;
      }
    >();
    const getChannelRow = (channel: { id: string; name: string }) => {
      const row = grouped.get(channel.id) || {
        channelId: channel.id,
        channel: channel.name,
        revenue: 0,
        quantity: 0,
        profit: 0,
        transactionCount: 0,
      };
      grouped.set(channel.id, row);
      return row;
    };
    for (const invoice of invoices) {
      const channel = invoiceToChannel.get(invoice.id)!;
      const row = getChannelRow(channel);
      row.revenue += invoice.totalAmount;
      row.quantity += invoice.items.reduce((sum, item) => sum + item.quantity, 0);
      row.transactionCount += 1;
    }
    for (const returned of returns) {
      const channel = invoiceToChannel.get(returned.invoiceId);
      if (!channel) continue;
      const row = getChannelRow(channel);
      row.revenue -= returned.totalAmount;
      row.quantity -= returned.items.reduce((sum, item) => sum + item.quantity, 0);
    }
    for (const movement of movements) {
      const invoiceId =
        movement.referenceType === 'SalesReturn'
          ? returnToInvoice.get(movement.referenceId || '')
          : movement.referenceId;
      const channel = invoiceId ? invoiceToChannel.get(invoiceId) : undefined;
      if (!channel) continue;
      const cost =
        Math.abs(movement.quantity) * (movement.unitCost ?? movement.product.buyingPrice);
      const signedCost = movement.type === 'SALE' ? cost : -cost;
      getChannelRow(channel).profit -= signedCost;
    }
    for (const row of grouped.values()) row.profit += row.revenue;
    return [...grouped.values()].map((row) => ({
      ...row,
      revenue: round(row.revenue),
      quantity: round(row.quantity),
      profit: round(row.profit),
    }));
  }

  private async expenseTotalsByCategory(businessId: string, range: DateRange) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId,
        status: { in: RECOGNIZED_EXPENSE_STATUSES },
        expenseDate: { gte: range.startDate, lte: range.endDate },
      },
      include: { category: true, items: { include: { category: true } } },
    });
    const grouped = new Map<string, { categoryId: string; categoryName: string; amount: number }>();
    for (const expense of expenses) {
      const items = expense.items.length
        ? expense.items
        : [{ categoryId: expense.categoryId, category: expense.category, amount: expense.amount }];
      for (const item of items) {
        const entry = grouped.get(item.categoryId) || {
          categoryId: item.categoryId,
          categoryName: item.category.name,
          amount: 0,
        };
        entry.amount += item.amount;
        grouped.set(item.categoryId, entry);
      }
    }
    return [...grouped.values()].map((item) => ({ ...item, amount: round(item.amount) }));
  }

  private budgetWindows(range: DateRange, period: string) {
    const group: AnalyticsGroup =
      period === 'MONTHLY' ? 'MONTHLY' : period === 'QUARTERLY' ? 'QUARTERLY' : 'YEARLY';
    return this.buckets(range, group).length;
  }

  private sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
    const map = new Map<string, number>();
    for (const row of rows) map.set(key(row), (map.get(key(row)) || 0) + value(row));
    return map;
  }

  private percentile(sortedValues: number[], value: number) {
    if (!sortedValues.length || (sortedValues.length === 1 && value <= 0)) return 0;
    if (sortedValues.length === 1) return 100;
    const lessOrEqual = sortedValues.filter((item) => item <= value).length;
    return round((lessOrEqual / sortedValues.length) * 100);
  }

  private paginate<T>(items: T[], page: number, limit: number) {
    const total = items.length;
    const start = (page - 1) * limit;
    return {
      data: items.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private toCsv(report: unknown) {
    const flattened = this.flattenRows(report);
    const headers = [...new Set(flattened.flatMap((row) => Object.keys(row)))];
    const cell = (raw: unknown) => {
      let value = String(raw ?? '');
      if (typeof raw !== 'number' && /^[=+@\-\t\r]/.test(value)) value = `'${value}`;
      return `"${value.replace(/"/g, '""')}"`;
    };
    return [
      headers.map(cell).join(','),
      ...flattened.map((row) => headers.map((header) => cell(row[header])).join(',')),
    ].join('\r\n');
  }

  private flattenRows(report: unknown): Array<Record<string, unknown>> {
    const rows = Array.isArray(report)
      ? report
      : report && typeof report === 'object' && Array.isArray((report as any).data)
        ? (report as any).data
        : report && typeof report === 'object'
          ? [report]
          : [{ value: report }];
    const flatten = (value: any, prefix = '', result: Record<string, unknown> = {}) => {
      if (value === null || value === undefined) {
        result[prefix || 'value'] = '';
      } else if (Array.isArray(value) || typeof value !== 'object' || value instanceof Date) {
        result[prefix || 'value'] =
          Array.isArray(value) || value instanceof Date ? JSON.stringify(value) : value;
      } else {
        for (const [key, child] of Object.entries(value))
          flatten(child, prefix ? `${prefix}.${key}` : key, result);
      }
      return result;
    };
    return rows.map((row) => flatten(row));
  }

  private toXlsx(report: unknown): Buffer {
    const rows = this.flattenRows(report);
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const allRows: unknown[][] = [
      headers,
      ...rows.map((row) => headers.map((header) => row[header] ?? '')),
    ];
    const columnName = (index: number) => {
      let name = '';
      for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
        name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
      }
      return name;
    };
    const xmlEscape = (value: string) =>
      value.replace(
        /[<>&"']/g,
        (char) =>
          ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&apos;',
          })[char]!,
      );
    const sheetRows = allRows
      .map((row, rowIndex) => {
        const cells = row
          .map((raw, colIndex) => {
            const address = `${columnName(colIndex)}${rowIndex + 1}`;
            if (typeof raw === 'number' && Number.isFinite(raw))
              return `<c r="${address}"><v>${raw}</v></c>`;
            if (typeof raw === 'boolean')
              return `<c r="${address}" t="b"><v>${raw ? 1 : 0}</v></c>`;
            const value =
              raw instanceof Date
                ? raw.toISOString()
                : typeof raw === 'string'
                  ? raw
                  : JSON.stringify(raw ?? '');
            return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
          })
          .join('');
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join('');
    const files: Array<[string, string]> = [
      [
        '[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ],
      [
        '_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ],
      [
        'xl/workbook.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ],
      [
        'xl/_rels/workbook.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ],
      [
        'xl/worksheets/sheet1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
      ],
    ];
    return this.zipFiles(files);
  }

  private toPdf(report: unknown, title: string): Buffer {
    const rows = this.flattenRows(report);
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const lines = [
      title.replace(/_/g, ' '),
      ...rows.map((row) =>
        headers.map((header) => `${header}: ${String(row[header] ?? '')}`).join(' | '),
      ),
    ];
    const wrapped = lines.flatMap((line) => line.match(/.{1,105}(?:\s|$)|.{1,105}/g) || ['']);
    const pages: string[][] = [];
    for (let index = 0; index < wrapped.length; index += 48)
      pages.push(wrapped.slice(index, index + 48));
    if (!pages.length) pages.push(['No data']);
    const objects: string[] = [];
    const addObject = (value: string) => {
      objects.push(value);
      return objects.length;
    };
    const catalogId = addObject('');
    const pagesId = addObject('');
    const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const pageIds: number[] = [];
    for (const pageLines of pages) {
      const escapedLines = pageLines.map((line) =>
        line
          .normalize('NFKD')
          .replace(/[^\x20-\x7E]/g, '?')
          .replace(/([\\()])/g, '\\$1'),
      );
      const stream = `BT /F1 8 Tf 36 756 Td 12 TL ${escapedLines.map((line) => `(${line}) Tj T*`).join(' ')} ET`;
      const streamId = addObject(
        `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
      );
      pageIds.push(
        addObject(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
        ),
      );
    }
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, 'ascii'));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, 'ascii');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'ascii');
  }

  private zipFiles(files: Array<[string, string]>): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    const crc32 = (buffer: Buffer) => {
      let crc = 0xffffffff;
      for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    for (const [path, body] of files) {
      const name = Buffer.from(path, 'utf8');
      const uncompressed = Buffer.from(body, 'utf8');
      const compressed = deflateRawSync(uncompressed);
      const crc = crc32(uncompressed);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(8, 8);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(uncompressed.length, 22);
      local.writeUInt16LE(name.length, 26);
      localParts.push(local, name, compressed);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8);
      central.writeUInt16LE(8, 10);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(compressed.length, 20);
      central.writeUInt32LE(uncompressed.length, 24);
      central.writeUInt16LE(name.length, 28);
      central.writeUInt32LE(offset, 42);
      centralParts.push(central, name);
      offset += local.length + name.length + compressed.length;
    }
    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, centralDirectory, end]);
  }
}
