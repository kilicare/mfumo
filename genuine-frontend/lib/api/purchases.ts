import { apiClient, unwrap } from '@/lib/api';

export type PurchaseStatus =
  'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CLOSED' | 'CANCELLED';
export interface PurchaseOrderItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  requiresExpiry: boolean;
  grnReceivedQty: number;
  grnAcceptedQty: number;
  returnedQty: number;
  outstandingQty: number;
  notes?: string;
}
export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  locationId: string;
  locationName: string;
  status: PurchaseStatus;
  items: PurchaseOrderItem[];
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  taxRecoverable: boolean;
  totalAmount: number;
  totalReceived: number;
  totalPaid: number;
  totalReturned: number;
  balanceDue: number;
  orderDate: string;
  expectedDeliveryDate?: string;
  notes?: string;
  referenceNumber?: string;
  createdAt: string;
  updatedAt: string;
}
export interface GoodsReceivedNote {
  id: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  locationName: string;
  status: 'RECEIVED' | 'ACCEPTED' | 'REJECTED';
  items: Array<{
    id: string;
    purchaseOrderItemId: string;
    productName: string;
    productSku: string;
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    damageQuantity: number;
    batchNumber?: string;
    expiryDate?: string;
    notes?: string;
  }>;
  totalReceivedQty: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;
  totalDamageQty: number;
  receivedDate: string;
  vehicleRegistration?: string;
  driverName?: string;
  waybillNumber?: string;
  receivedBy?: string;
  notes?: string;
}
export interface UpdateGoodsReceivedNoteInput {
  receivedDate?: string;
  items?: Array<{
    purchaseOrderItemId: string;
    receivedQuantity?: number;
    acceptedQuantity?: number;
    rejectedQuantity?: number;
    damageQuantity?: number;
    notes?: string;
    batchNumber?: string;
    expiryDate?: string;
  }>;
  vehicleRegistration?: string;
  driverName?: string;
  waybillNumber?: string;
  notes?: string;
}
export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  totalReturnAmount: number;
  notes?: string;
  items: Array<{
    id: string;
    purchaseOrderItemId: string;
    productName: string;
    productSku: string;
    quantity: number;
    reason: string;
  }>;
  createdAt: string;
}
export interface SupplierOption {
  id: string;
  name: string;
  supplierCode: string;
  isActive: boolean;
}
export interface LocationOption {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}
export interface PaymentMethodOption {
  id: string;
  name: string;
  isActive: boolean;
}
export interface PurchaseProductOption {
  id: string;
  name: string;
  sku: string;
  buyingPrice: number;
  defaultUnit: string;
  status: string;
}
export interface CreatePurchaseOrderInput {
  supplierId: string;
  locationId: string;
  idempotencyKey?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number; discount?: number }>;
  shippingCost?: number;
  taxAmount?: number;
  taxPercentage?: number;
  taxRecoverable?: boolean;
  notes?: string;
  referenceNumber?: string;
}

export const purchasesAPI = {
  async orders(
    filters: {
      search?: string;
      status?: string;
      supplierId?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    } = {}
  ) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return unwrap<{ data: PurchaseOrder[]; total: number; page: number; limit: number }>(
      await apiClient.get(`/purchases/orders?${params}`)
    );
  },
  async order(id: string) {
    return unwrap<PurchaseOrder>(
      await apiClient.get(`/purchases/orders/${encodeURIComponent(id)}`)
    );
  },
  async createOrder(input: CreatePurchaseOrderInput) {
    return unwrap<PurchaseOrder>(await apiClient.post('/purchases/orders', input));
  },
  async updateOrder(id: string, input: Record<string, unknown>) {
    return unwrap<PurchaseOrder>(
      await apiClient.patch(`/purchases/orders/${encodeURIComponent(id)}`, input)
    );
  },
  async approveOrder(id: string) {
    return unwrap<PurchaseOrder>(
      await apiClient.post(`/purchases/orders/${encodeURIComponent(id)}/approve`)
    );
  },
  async cancelOrder(id: string, reason: string) {
    return unwrap<PurchaseOrder>(
      await apiClient.post(`/purchases/orders/${encodeURIComponent(id)}/cancel`, { reason })
    );
  },
  async payment(
    id: string,
    input: {
      amount: number;
      paymentMethodId: string;
      idempotencyKey?: string;
      paymentDate?: string;
      reference?: string;
      notes?: string;
    }
  ) {
    return unwrap(
      await apiClient.post(`/purchases/orders/${encodeURIComponent(id)}/payments`, input)
    );
  },
  async grns(purchaseOrderId?: string) {
    return unwrap<GoodsReceivedNote[]>(
      await apiClient.get(
        `/purchases/grn${purchaseOrderId ? `?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}` : ''}`
      )
    );
  },
  async grn(id: string) {
    return unwrap<GoodsReceivedNote>(
      await apiClient.get(`/purchases/grn/${encodeURIComponent(id)}`)
    );
  },
  async createGrn(input: {
    purchaseOrderId: string;
    idempotencyKey?: string;
    items: Array<{
      purchaseOrderItemId: string;
      receivedQuantity: number;
      acceptedQuantity: number;
      rejectedQuantity: number;
      damageQuantity: number;
      batchNumber?: string;
      expiryDate?: string;
    }>;
    receivedDate?: string;
    vehicleRegistration?: string;
    driverName?: string;
    waybillNumber?: string;
    notes?: string;
  }) {
    return unwrap<GoodsReceivedNote>(await apiClient.post('/purchases/grn', input));
  },
  async updateGrn(id: string, input: UpdateGoodsReceivedNoteInput) {
    return unwrap<GoodsReceivedNote>(
      await apiClient.patch(`/purchases/grn/${encodeURIComponent(id)}`, input)
    );
  },
  async acceptGrn(id: string) {
    return unwrap<GoodsReceivedNote>(
      await apiClient.post(`/purchases/grn/${encodeURIComponent(id)}/accept`)
    );
  },
  async rejectGrn(id: string, reason: string) {
    return unwrap<GoodsReceivedNote>(
      await apiClient.post(`/purchases/grn/${encodeURIComponent(id)}/reject`, { reason })
    );
  },
  async returns(purchaseOrderId?: string) {
    return unwrap<PurchaseReturn[]>(
      await apiClient.get(
        `/purchases/returns${purchaseOrderId ? `?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}` : ''}`
      )
    );
  },
  async purchaseReturn(id: string) {
    return unwrap<PurchaseReturn>(
      await apiClient.get(`/purchases/returns/${encodeURIComponent(id)}`)
    );
  },
  async createReturn(input: {
    purchaseOrderId: string;
    idempotencyKey?: string;
    items: Array<{
      purchaseOrderItemId: string;
      quantity: number;
      reason: 'DEFECTIVE' | 'EXPIRED' | 'WRONG_ITEM' | 'OVERAGE' | 'OTHER';
    }>;
    notes?: string;
  }) {
    return unwrap<PurchaseReturn>(await apiClient.post('/purchases/returns', input));
  },
  async approveReturn(id: string) {
    return unwrap<PurchaseReturn>(
      await apiClient.post(`/purchases/returns/${encodeURIComponent(id)}/approve`)
    );
  },
  async rejectReturn(id: string, reason: string) {
    return unwrap<PurchaseReturn>(
      await apiClient.post(`/purchases/returns/${encodeURIComponent(id)}/reject`, { reason })
    );
  },
  async suppliers() {
    const r = unwrap<{ data: SupplierOption[] }>(
      await apiClient.get('/suppliers-customers/suppliers?page=1&limit=100')
    );
    return r.data;
  },
  async locations() {
    return unwrap<LocationOption[]>(await apiClient.get('/business/locations'));
  },
  async paymentMethods() {
    return unwrap<PaymentMethodOption[]>(await apiClient.get('/business/payment-methods'));
  },
  async products() {
    const r = unwrap<{ data: PurchaseProductOption[] }>(
      await apiClient.get('/products?status=ACTIVE&page=1&limit=100')
    );
    return r.data;
  },
};

export function purchaseMoney(value: number, currency = 'TZS') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
