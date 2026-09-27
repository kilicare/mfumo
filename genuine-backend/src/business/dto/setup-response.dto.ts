export class BusinessSetupResponseDto {
  message: string;
  business: {
    id: string;
    name: string;
    businessType: string;
    currency: string;
    taxPercentage: number;
    costingMethod: string;
    allowNegativeStock: boolean;
    requireApprovalForDiscounts: boolean;
    requireApprovalForReturns: boolean;
    isSetupComplete: boolean;
  };
  locationsCreated: number;
  paymentMethodsCreated: number;
  expenseCategoriesCreated: number;
  unitsCreated: number;
  rolesCreated: number;
  permissionsCreated: number;
}
