import { apiClient, unwrap } from '@/lib/api';
import type { Product } from '@/lib/api/products';
import type { LocationOption, PaymentMethodOption } from '@/lib/api/purchases';

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';
export type ReturnStatus = 'DRAFT' | 'AUTHORIZED' | 'RECEIVED' | 'COMPLETED' | 'REJECTED';
export type PaymentTerms = 'NET-7' | 'NET-14' | 'NET-30' | 'NET-45' | 'NET-60' | 'COD' | 'PREPAID';
export type ReturnReason =
  | 'DEFECTIVE'
  | 'EXPIRED'
  | 'WRONG_ITEM'
  | 'OVERAGE'
  | 'CUSTOMER_REQUEST'
  | 'OTHER';

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  customerCode: string;
  customerType: string;
  email?: string;
  phone?: string;
  creditLimit: number;
  paymentTerms: string;
  outstandingBalance: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  totalReturned: number;
  creditUtilization: number;
  isActive: boolean;
}

export interface SalesInvoiceOptions {
  locations: LocationOption[];
  salespeople: Array<{ id: string; name: string }>;
  taxPercentage: number;
  currency: string;
}

export interface SalesInvoiceItem {
  id: string;
  salesInvoiceId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  lineTotal: number;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
}

export interface SalesInvoice {
  id: string;
  businessId: string;
  currency: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  customerType: string;
  locationId: string;
  locationName: string;
  invoiceDate: string;
  dueDate?: string;
  salespersonId?: string;
  status: InvoiceStatus;
  items: SalesInvoiceItem[];
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  taxableAmount: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
  totalPaid: number;
  returnCredits: number;
  balance: number;
  paymentTerms: PaymentTerms;
  referenceNumber?: string;
  notes?: string;
  attachments?: string[];
  issuedDate?: string;
  approvedBy?: string;
  approvedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesReturnItem {
  id: string;
  salesReturnId: string;
  salesInvoiceItemId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  reason: ReturnReason;
  notes?: string;
}

export interface SalesReturn {
  id: string;
  businessId: string;
  currency: string;
  returnNumber: string;
  salesInvoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  status: ReturnStatus;
  items: SalesReturnItem[];
  totalReturnAmount: number;
  authorizedBy?: string;
  authorizedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesPayment {
  id: string;
  businessId: string;
  paymentNumber: string;
  paymentDate: string;
  customerId: string;
  salesInvoiceId: string;
  amount: number;
  paymentMethodId: string;
  reference?: string;
  notes?: string;
  status: string;
  createdAt: string;
}

export interface InvoiceItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercentage?: number;
  discountAmount?: number;
  notes?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface CreateSalesInvoiceInput {
  customerId: string;
  locationId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  salespersonId?: string;
  items: InvoiceItemInput[];
  discountAmount?: number;
  discountPercentage?: number;
  taxAmount?: number;
  taxPercentage?: number;
  paymentTerms?: PaymentTerms;
  referenceNumber?: string;
  notes?: string;
  attachments?: string[];
  requiresApproval?: boolean;
}

export interface UpdateSalesInvoiceInput {
  customerId?: string;
  locationId?: string;
  invoiceDate?: string;
  dueDate?: string;
  salespersonId?: string;
  items?: InvoiceItemInput[];
  discountAmount?: number;
  discountPercentage?: number;
  taxAmount?: number;
  taxPercentage?: number;
  paymentTerms?: PaymentTerms;
  referenceNumber?: string;
  notes?: string;
  attachments?: string[];
}

export interface CreateSalesReturnInput {
  salesInvoiceId: string;
  returnNumber?: string;
  items: Array<{
    salesInvoiceItemId: string;
    quantity: number;
    reason: ReturnReason;
    notes?: string;
  }>;
  authorizeNow?: boolean;
  notes?: string;
}

export interface SalesInvoiceFilters {
  search?: string;
  customerId?: string;
  locationId?: string;
  salespersonId?: string;
  status?: InvoiceStatus;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'invoiceNumber' | 'totalAmount' | 'invoiceDate' | 'dueDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface SalesReturnFilters {
  search?: string;
  salesInvoiceId?: string;
  status?: ReturnStatus;
  page?: number;
  limit?: number;
}

export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SalesDashboardSummary {
  period: string;
  currency: string;
  metrics: {
    invoiceCount: number;
    revenue: number;
    quantitySold: number;
    averageOrderValue: number;
    paidAmount: number;
    outstandingAmount: number;
    unpaidInvoiceCount: number;
  };
  topCustomers: Array<{ customerId: string; customerName: string; revenue: number; invoiceCount: number }>;
}

export interface OutstandingReceivables {
  asOf: string;
  currency: string;
  totalOutstanding: number;
  invoiceCount: number;
  customerCount: number;
  customers: Array<{
    customerId: string; customerName: string; customerCode: string; balance: number;
    invoiceCount: number;
    invoices: Array<{
      invoiceId: string; invoiceNumber: string; invoiceDate: string; dueDate?: string;
      totalAmount: number; totalPaid: number; returnCredits: number; balance: number; daysOverdue: number;
    }>;
  }>;
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  period: string;
  openingBalance: number;
  sales: number;
  payments: number;
  returns: number;
  closingBalance: number;
  invoices: Array<{ date: string; invoiceNumber: string; amount: number; type: 'SALE' | 'PAYMENT' | 'RETURN' }>;
}

function queryString(filters: object = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

export const salesAPI = {
  async invoiceOptions() {
    return unwrap<SalesInvoiceOptions>(await apiClient.get('/sales/options'));
  },
  async customers() {
    const result = unwrap<{ data: Customer[] }>(
      await apiClient.get('/suppliers-customers/customers?page=1&limit=100&status=ACTIVE'),
    );
    return result.data;
  },
  async customer(id: string) {
    return unwrap<Customer>(
      await apiClient.get(`/suppliers-customers/customers/${encodeURIComponent(id)}`),
    );
  },
  async products() {
    const result = unwrap<{ data: Product[] }>(
      await apiClient.get('/products?status=ACTIVE&page=1&limit=100'),
    );
    return result.data;
  },
  async locations() {
    const options = unwrap<SalesInvoiceOptions>(await apiClient.get('/sales/options'));
    return options.locations;
  },
  async paymentMethods() {
    return unwrap<PaymentMethodOption[]>(await apiClient.get('/payments/methods'));
  },
  async invoices(filters: SalesInvoiceFilters = {}) {
    return unwrap<PageResult<SalesInvoice>>(
      await apiClient.get(`/sales/invoices?${queryString(filters)}`),
    );
  },
  async invoice(id: string) {
    return unwrap<SalesInvoice>(await apiClient.get(`/sales/invoices/${encodeURIComponent(id)}`));
  },
  async createInvoice(input: CreateSalesInvoiceInput) {
    return unwrap<SalesInvoice>(await apiClient.post('/sales/invoices', input));
  },
  async updateInvoice(id: string, input: UpdateSalesInvoiceInput) {
    return unwrap<SalesInvoice>(
      await apiClient.patch(`/sales/invoices/${encodeURIComponent(id)}`, input),
    );
  },
  async applyInvoiceDiscount(id: string, percentage: number, reason?: string) {
    return unwrap<SalesInvoice>(
      await apiClient.post(`/sales/invoices/${encodeURIComponent(id)}/discount`, {
        percentage,
        ...(reason ? { reason } : {}),
      }),
    );
  },
  async issueInvoice(id: string) {
    return unwrap<SalesInvoice>(
      await apiClient.post(`/sales/invoices/${encodeURIComponent(id)}/issue`, {}),
    );
  },
  async cancelInvoice(id: string, reason: string) {
    return unwrap<SalesInvoice>(
      await apiClient.post(`/sales/invoices/${encodeURIComponent(id)}/cancel`, { reason }),
    );
  },
  async recordPayment(
    id: string,
    input: { amount: number; paymentMethodId: string; paymentDate?: string; paymentNumber?: string; reference?: string; notes?: string },
    idempotencyKey: string,
  ) {
    return unwrap<SalesPayment>(
      await apiClient.post(`/sales/invoices/${encodeURIComponent(id)}/payments`, input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    );
  },
  async returns(filters: SalesReturnFilters = {}) {
    return unwrap<PageResult<SalesReturn>>(
      await apiClient.get(`/sales/returns?${queryString(filters)}`),
    );
  },
  async salesReturn(id: string) {
    return unwrap<SalesReturn>(await apiClient.get(`/sales/returns/${encodeURIComponent(id)}`));
  },
  async createReturn(input: CreateSalesReturnInput) {
    return unwrap<SalesReturn>(await apiClient.post('/sales/returns', input));
  },
  async authorizeReturn(id: string) {
    return unwrap<SalesReturn>(
      await apiClient.post(`/sales/returns/${encodeURIComponent(id)}/authorize`, {}),
    );
  },
  async receiveReturn(id: string) {
    return unwrap<SalesReturn>(
      await apiClient.post(`/sales/returns/${encodeURIComponent(id)}/receive`, {}),
    );
  },
  async rejectReturn(id: string, reason: string) {
    return unwrap<SalesReturn>(
      await apiClient.post(`/sales/returns/${encodeURIComponent(id)}/reject`, { reason }),
    );
  },
  async salesSummary(filters: { dateFrom?: string; dateTo?: string } = {}) {
    return unwrap<SalesDashboardSummary>(
      await apiClient.get(`/analytics/dashboard/sales?${queryString(filters)}`),
    );
  },
  async outstandingReceivables() {
    return unwrap<OutstandingReceivables>(
      await apiClient.get('/analytics/sales/outstanding-receivables'),
    );
  },
  async customerStatement(customerId: string, filters: { month?: string; dateFrom?: string; dateTo?: string } = {}) {
    return unwrap<CustomerStatement>(
      await apiClient.get(`/suppliers-customers/customers/${encodeURIComponent(customerId)}/statement?${queryString(filters)}`),
    );
  },
};
