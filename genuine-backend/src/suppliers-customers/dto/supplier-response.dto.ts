export class SupplierContactResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position?: string;
  isPrimary: boolean;
}

export class SupplierAddressResponseDto {
  id: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country?: string;
}

export class SupplierResponseDto {
  id: string;
  businessId: string;
  name: string;
  supplierCode: string;
  description?: string;
  email: string;
  phone: string;
  secondaryPhone?: string;
  address?: SupplierAddressResponseDto;
  contacts: SupplierContactResponseDto[];
  bankName?: string;
  bankAccountNumber?: string;
  bankSwiftCode?: string;
  taxId?: string;
  creditLimit: number;
  paymentTerms: string;
  openingBalance: number;
  totalPurchased: number; // Non-draft, non-cancelled purchase orders
  totalPaid: number; // Active supplier payments
  totalReturned: number; // Approved purchase returns
  outstandingBalance: number; // openingBalance + totalPurchased - totalPaid - totalReturned
  creditUtilization: number; // percentage
  isActive: boolean;
  lastPurchaseDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}
