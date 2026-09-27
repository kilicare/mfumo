export class PurchaseOrderItemResponseDto {
  id: string;
  purchaseOrderId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  grnReceivedQty: number;
  returnedQty: number;
  outstandingQty: number;
  notes?: string;
}

export class PurchaseOrderResponseDto {
  id: string;
  businessId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  locationId: string;
  locationName: string;
  status: string; // DRAFT, ORDERED, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED, CANCELLED
  items: PurchaseOrderItemResponseDto[];
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  totalReceived: number;
  totalPaid: number;
  balanceDue: number;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  cancelledBy?: string;
  cancelledAt?: Date;
  notes?: string;
  referenceNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GRNItemResponseDto {
  id: string;
  grnId: string;
  purchaseOrderItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  damageQuantity: number;
  notes?: string;
}

export class GRNResponseDto {
  id: string;
  businessId: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  status: string; // RECEIVED, ACCEPTED, REJECTED
  items: GRNItemResponseDto[];
  totalReceivedQty: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;
  totalDamageQty: number;
  vehicleRegistration?: string;
  driverName?: string;
  waybillNumber?: string;
  receivedBy: string;
  receivedDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PurchaseReturnItemResponseDto {
  id: string;
  purchaseReturnId: string;
  purchaseOrderItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  reason: string;
  notes?: string;
}

export class PurchaseReturnResponseDto {
  id: string;
  businessId: string;
  returnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string; // DRAFT, APPROVED, REJECTED, COMPLETED
  items: PurchaseReturnItemResponseDto[];
  totalReturnAmount: number;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
