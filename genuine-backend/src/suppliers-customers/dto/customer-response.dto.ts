export class CustomerContactResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position?: string;
  isPrimary: boolean;
}

export class CustomerAddressResponseDto {
  id: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country?: string;
}

export class CustomerResponseDto {
  id: string;
  businessId: string;
  name: string;
  customerCode: string;
  customerType: string;
  description?: string;
  email: string;
  phone: string;
  secondaryPhone?: string;
  address?: CustomerAddressResponseDto;
  contacts: CustomerContactResponseDto[];
  taxId?: string;
  creditLimit: number;
  paymentTerms: string;
  openingBalance: number;
  totalSales: number; // Issued invoice amounts
  totalPaid: number; // Active customer payments
  totalReturned: number; // Received/completed sales return credits
  outstandingBalance: number; // openingBalance + totalSales - totalPaid - totalReturned
  creditUtilization: number; // percentage
  isActive: boolean;
  lastSaleDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}
