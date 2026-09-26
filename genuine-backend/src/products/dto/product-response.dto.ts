export class ProductUnitResponseDto {
  id: string;
  productId: string;
  unitId: string;
  unitName: string;
  unitSymbol: string;
  conversionFactor: number;
  isDefault: boolean;
}

export class ProductResponseDto {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  brandId?: string;
  brandName?: string;
  buyingPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  margin: number;
  defaultUnitId: string;
  defaultUnit: string;
  productUnits: ProductUnitResponseDto[];
  minimumStock: number;
  reorderLevel: number;
  status: string;
  barcode?: string;
  manufacturer?: string;
  weight?: number;
  color?: string;
  size?: string;
  expiryDays?: number;
  requiresExpiry: boolean;
  currentStock?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class CategoryResponseDto {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  parentCategoryId?: string;
  parentCategoryName?: string;
  productCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class BrandResponseDto {
  id: string;
  name: string;
  description?: string;
  productCount: number;
  isActive: boolean;
  createdAt: Date;
}
