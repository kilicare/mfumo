export class PurchasePaymentResponseDto {
  id: string;
  businessId: string;
  paymentNumber: string;
  paymentDate: Date;
  supplierId: string;
  purchaseOrderId: string;
  amount: number;
  paymentMethodId: string;
  reference?: string;
  notes?: string;
  status: string;
  createdAt: Date;
}
