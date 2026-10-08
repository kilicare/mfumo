export class SalesInvoiceItemResponseDto {
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

export class SalesInvoiceResponseDto {
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
  invoiceDate: Date;
  salespersonId?: string;
  status: string;
  items: SalesInvoiceItemResponseDto[];
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
  paymentTerms: string;
  attachments?: string[];
  referenceNumber?: string;
  issuedDate?: Date;
  dueDate?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  cancelledBy?: string;
  cancelledAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SalesReturnItemResponseDto {
  id: string;
  salesReturnId: string;
  salesInvoiceItemId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  reason: string;
  notes?: string;
}

export class SalesReturnResponseDto {
  id: string;
  businessId: string;
  currency: string;
  returnNumber: string;
  salesInvoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  items: SalesReturnItemResponseDto[];
  totalReturnAmount: number;
  authorizedBy?: string;
  authorizedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  receivedBy?: string;
  receivedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SalesPaymentResponseDto {
  id: string;
  businessId: string;
  paymentNumber: string;
  paymentDate: Date;
  customerId: string;
  salesInvoiceId: string;
  amount: number;
  paymentMethodId: string;
  reference?: string;
  notes?: string;
  status: string;
  createdAt: Date;
}
