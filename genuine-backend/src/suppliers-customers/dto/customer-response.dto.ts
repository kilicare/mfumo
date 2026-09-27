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
  totalSales: number; // Sum of all invoice amounts
  totalPaid: number; // Sum of all payments
  outstandingBalance: number; // openingBalance + totalSales - totalPaid
  creditUtilization: number; // percentage
  isActive: boolean;
  lastSaleDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}
