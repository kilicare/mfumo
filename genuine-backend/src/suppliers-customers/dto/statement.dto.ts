export class SupplierStatementDto {
  supplierId: string;
  supplierName: string;
  period: string; // YYYY-MM
  openingBalance: number;
  purchases: number;
  payments: number;
  closingBalance: number;
  invoices: {
    date: Date;
    invoiceNumber: string;
    amount: number;
    type: 'PURCHASE' | 'PAYMENT' | 'RETURN';
  }[];
}

export class CustomerStatementDto {
  customerId: string;
  customerName: string;
  period: string; // YYYY-MM
  openingBalance: number;
  sales: number;
  payments: number;
  closingBalance: number;
  invoices: {
    date: Date;
    invoiceNumber: string;
    amount: number;
    type: 'SALE' | 'PAYMENT' | 'RETURN';
  }[];
}
