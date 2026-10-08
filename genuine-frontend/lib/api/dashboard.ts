import { apiClient, unwrap } from '@/lib/api';

export type DashboardGroupBy = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface DashboardFilter {
  dateFrom: string;
  dateTo: string;
  groupBy: DashboardGroupBy;
}

export interface DashboardMetric {
  name: string;
  label: string;
  value: number;
  unit: string;
  previousValue: number;
  changePercent: number | null;
  trend: 'UP' | 'DOWN' | 'FLAT';
  status: 'GOOD' | 'WARNING' | 'CRITICAL';
  formula?: string;
}

export interface DashboardExecutiveData {
  period: string;
  asOf: string;
  inventoryAsOf: string;
  currency: string;
  summary: {
    totalRevenue: DashboardMetric;
    totalExpenses: DashboardMetric;
    totalProfit: DashboardMetric;
    profitMargin: DashboardMetric;
    totalSales: DashboardMetric;
    totalPurchases: DashboardMetric;
    cashOnHand: DashboardMetric;
    outstandingReceivables: DashboardMetric;
    outstandingPayables: DashboardMetric;
    inventoryValue: DashboardMetric;
  };
  kpis: DashboardMetric[];
  charts: {
    periods: string[];
    revenueVsExpenses: Array<{ label: string; data: number[] }>;
    topProducts: { labels: string[]; revenue: number[]; quantity: number[] };
    salesTrend: { labels: string[]; values: number[] };
    cashFlow: {
      labels: string[];
      inflows: number[];
      outflows: number[];
      netFlow: number[];
    };
    customerMetrics: { labels: string[]; revenue: number[]; transactions: number[] };
  };
  definitions: Record<string, string>;
}

export interface ExpenseBreakdownRow {
  categoryId: string;
  category: string;
  amount: number;
  percentage: number;
  budget?: number;
  variance?: number | null;
  previousAmount: number;
  changePercent: number | null;
  trend: 'UP' | 'DOWN' | 'FLAT';
}

export interface LowStockRow {
  productId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationName: string;
  quantity: number;
  minimumStock: number;
  reorderLevel: number;
  belowMinimum: boolean;
  atOrBelowReorderLevel: boolean;
  daysToStockout: number | null;
}

export interface DashboardTransaction {
  id: string;
  type: 'sale' | 'purchase' | 'expense' | 'payment';
  reference: string;
  description: string;
  amount: number;
  status: string;
  date: string;
}

interface PageResponse<T> {
  data: T[];
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  invoiceDate: string;
}

interface PurchaseRow {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  orderDate: string;
}

interface ExpenseRow {
  id: string;
  expenseNumber: string;
  categoryName: string;
  status: string;
  totalAmount: number;
  expenseDate: string;
}

interface PaymentRow {
  id: string;
  paymentNumber: string;
  referenceType: string | null;
  poId?: string | null;
  invoiceId?: string | null;
  expenseId?: string | null;
  supplierId?: string | null;
  customerId?: string | null;
  status: string;
  amount: number | string;
  paymentDate: string;
}

async function loadPage<T>(path: string, params: Record<string, string | number>) {
  const response = await apiClient.get<PageResponse<T>>(path, { params });
  return unwrap<PageResponse<T>>(response).data;
}

export const dashboardAPI = {
  async getExecutive(filter: DashboardFilter) {
    const response = await apiClient.get<DashboardExecutiveData | { data: DashboardExecutiveData }>(
      '/analytics/dashboard/executive',
      { params: filter },
    );
    return unwrap<DashboardExecutiveData>(response);
  },

  async getExpenseBreakdown(filter: DashboardFilter) {
    const response = await apiClient.get<ExpenseBreakdownRow[] | { data: ExpenseBreakdownRow[] }>(
      '/analytics/expense-breakdown',
      { params: filter },
    );
    return unwrap<ExpenseBreakdownRow[]>(response);
  },

  async getLowStock(limit = 8) {
    const response = await apiClient.get<PageResponse<LowStockRow> & { total: number }>(
      '/inventory/reports/low-stock',
      {
        params: {
          page: 1,
          limit,
          type: 'BOTH',
        },
      },
    );
    return unwrap<PageResponse<LowStockRow> & { total: number }>(response);
  },

  async getRecentTransactions(permissions: string[]) {
    const sources: Array<{ name: string; request: Promise<DashboardTransaction[]> }> = [];

    if (permissions.includes('sales.view')) {
      sources.push({ name: 'sales invoices', request: loadPage<InvoiceRow>('/sales/invoices', {
        page: 1, limit: 8, sortBy: 'createdAt', sortOrder: 'desc',
      }).then((rows) => rows.map((row) => ({
        id: `sale:${row.id}`, type: 'sale' as const, reference: row.invoiceNumber,
        description: row.customerName, amount: row.totalAmount, status: row.status,
        date: row.createdAt || row.invoiceDate,
      }))) });
    }

    if (permissions.includes('purchases.view')) {
      sources.push({ name: 'purchase orders', request: loadPage<PurchaseRow>('/purchases/orders', {
        page: 1, limit: 8, sortBy: 'createdAt', sortOrder: 'desc',
      }).then((rows) => rows.map((row) => ({
        id: `purchase:${row.id}`, type: 'purchase' as const, reference: row.poNumber,
        description: row.supplierName, amount: row.totalAmount, status: row.status,
        date: row.createdAt || row.orderDate,
      }))) });
    }

    if (permissions.includes('expenses.view')) {
      sources.push({ name: 'expenses', request: loadPage<ExpenseRow>('/payments/expenses', { page: 1, limit: 8 }).then((rows) => rows.map((row) => ({
        id: `expense:${row.id}`, type: 'expense' as const, reference: row.expenseNumber,
        description: row.categoryName, amount: row.totalAmount, status: row.status,
        date: row.expenseDate,
      }))) });
    }

    if (permissions.includes('payments.view')) {
      sources.push({ name: 'payments', request: loadPage<PaymentRow>('/payments', { page: 1, limit: 8 }).then((rows) => rows.map((row) => ({
        id: `payment:${row.id}`, type: 'payment' as const, reference: row.paymentNumber,
        description: paymentSourceLabel(row),
        amount: Number(row.amount), status: row.status, date: row.paymentDate,
      }))) });
    }

    const results = await Promise.allSettled(sources.map(({ request }) => request));
    return {
      transactions: results
        .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
        .filter((row) => Number.isFinite(row.amount) && Number.isFinite(new Date(row.date).getTime()))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8),
      unavailableSources: results.flatMap((result, index) => {
        if (result.status !== 'rejected') return [];
        const status = (result.reason as { response?: { status?: number } })?.response?.status;
        return [status ? `${sources[index].name} (HTTP ${status})` : sources[index].name];
      }),
    };
  },
};

function paymentSourceLabel(row: PaymentRow) {
  if (row.poId) return 'Purchase order';
  if (row.invoiceId) return 'Sales invoice';
  if (row.expenseId) return 'Expense';
  if (row.supplierId) return 'Supplier';
  if (row.customerId) return 'Customer';
  return (row.referenceType || 'Other').replace(/([a-z])([A-Z])/g, '$1 $2');
}
