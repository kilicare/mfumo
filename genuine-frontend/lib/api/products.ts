import { apiClient, unwrap } from '@/lib/api';

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
export interface ProductImageMeta {
  id: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductUnit {
  id: string;
  productId: string;
  unitId: string;
  unitName: string;
  unitSymbol: string;
  conversionFactor: number;
  isDefault: boolean;
}

export interface Product {
  id: string;
  businessId: string;
  currency: string;
  sku: string;
  name: string;
  description?: string | null;
  categoryId: string;
  categoryName: string;
  brandId?: string | null;
  brandName?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  buyingPrice: number;
  sellingPrice: number;
  wholesalePrice?: number | null;
  margin: number;
  defaultUnitId: string;
  defaultUnit: string;
  productUnits: ProductUnit[];
  images: ProductImageMeta[];
  minimumStock: number;
  reorderLevel: number;
  status: ProductStatus;
  barcode?: string | null;
  manufacturer?: string | null;
  weight?: number | null;
  color?: string | null;
  size?: string | null;
  expiryDays?: number | null;
  requiresExpiry: boolean;
  currentStock?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  businessId: string;
  name: string;
  description?: string | null;
  parentCategoryId?: string | null;
  parentCategoryName?: string | null;
  productCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  businessId: string | null;
  name: string;
  symbol: string;
  baseUnit?: string | null;
  conversionFactor: number;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
}

export interface Brand {
  id: string;
  businessId: string | null;
  name: string;
  description?: string | null;
  productCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface SupplierOption {
  id: string;
  name: string;
  supplierCode: string;
  isActive: boolean;
}

export interface ProductInput {
  sku: string;
  name: string;
  barcode?: string;
  description?: string;
  categoryId: string;
  supplierId?: string;
  brandId?: string;
  buyingPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  defaultUnitId: string;
  productUnits: Array<{ unitId: string; conversionFactor: number; isDefault: boolean }>;
  images?: string[];
  minimumStock: number;
  reorderLevel: number;
  status?: ProductStatus;
  manufacturer?: string;
  weight?: number;
  color?: string;
  size?: string;
  expiryDays?: number;
  requiresExpiry: boolean;
}

export type ProductUpdateInput = Omit<
  Partial<Omit<ProductInput, 'sku'>>,
  | 'description'
  | 'barcode'
  | 'supplierId'
  | 'brandId'
  | 'wholesalePrice'
  | 'manufacturer'
  | 'weight'
  | 'color'
  | 'size'
  | 'expiryDays'
> & {
  description?: string | null;
  barcode?: string | null;
  supplierId?: string | null;
  brandId?: string | null;
  wholesalePrice?: number | null;
  manufacturer?: string | null;
  weight?: number | null;
  color?: string | null;
  size?: string | null;
  expiryDays?: number | null;
};

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  status?: ProductStatus;
  minPrice?: number;
  maxPrice?: number;
  stockStatus?: 'BELOW_MINIMUM' | 'LOW_STOCK' | 'NORMAL' | 'OVERSTOCKED';
  sortBy?: 'name' | 'price' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ProductStock {
  product: { id: string; sku: string; name: string };
  totalQuantity: number;
  locations: Array<{
    locationId: string;
    locationName: string;
    locationCode: string;
    quantity: number;
    lastMovementAt: string;
  }>;
  recentMovements: Array<{
    id: string;
    type: string;
    quantity: number;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
    createdAt: string;
    locationId: string;
    locationName: string;
  }>;
}

function queryString(filters: ProductFilters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

export const productsAPI = {
  async list(filters: ProductFilters = {}) {
    return unwrap<{ data: Product[]; total: number; page: number; limit: number }>(
      await apiClient.get(`/products?${queryString(filters)}`)
    );
  },
  async get(id: string) {
    return unwrap<Product>(await apiClient.get(`/products/${encodeURIComponent(id)}`));
  },
  async getImage(productId: string, imageId: string) {
    return (
      await apiClient.get(
        `/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
        { responseType: 'blob' }
      )
    ).data as Blob;
  },
  async create(input: ProductInput) {
    return unwrap<Product>(await apiClient.post('/products', input));
  },
  async update(id: string, input: ProductUpdateInput) {
    return unwrap<Product>(await apiClient.patch(`/products/${encodeURIComponent(id)}`, input));
  },
  async remove(id: string) {
    return unwrap<{ message: string }>(
      await apiClient.delete(`/products/${encodeURIComponent(id)}`)
    );
  },
  async updateStatus(id: string, status: ProductStatus) {
    return unwrap<Product>(
      await apiClient.patch(`/products/${encodeURIComponent(id)}`, { status })
    );
  },
  async bulkUpdateStatus(productIds: string[], status: ProductStatus) {
    return unwrap<{ message: string; count: number }>(
      await apiClient.post('/products/bulk/status', { productIds, status })
    );
  },
  async bulkUpdatePrices(
    items: Array<{
      productId: string;
      buyingPrice?: number;
      sellingPrice?: number;
      wholesalePrice?: number;
    }>
  ) {
    return unwrap<{
      total: number;
      successful: number;
      failed: number;
      details: Array<{ productId: string; success: boolean; error?: string }>;
    }>(await apiClient.post('/products/bulk/prices', { items }));
  },
  async categories() {
    return unwrap<Category[]>(await apiClient.get('/products/categories'));
  },
  async createCategory(input: { name: string; description?: string; parentCategoryId?: string }) {
    return unwrap<Category>(await apiClient.post('/products/categories', input));
  },
  async updateCategory(
    id: string,
    input: { name?: string; description?: string; parentCategoryId?: string | null }
  ) {
    return unwrap<Category>(
      await apiClient.patch(`/products/categories/${encodeURIComponent(id)}`, input)
    );
  },
  async deleteCategory(id: string) {
    return unwrap<{ message: string }>(
      await apiClient.delete(`/products/categories/${encodeURIComponent(id)}`)
    );
  },
  async units() {
    return unwrap<Unit[]>(await apiClient.get('/products/units'));
  },
  async createUnit(input: {
    name: string;
    symbol: string;
    description?: string;
    baseUnit?: string;
    conversionFactor?: number;
  }) {
    return unwrap<Unit>(await apiClient.post('/products/units', input));
  },
  async updateUnit(
    id: string,
    input: {
      name?: string;
      symbol?: string;
      description?: string;
      baseUnit?: string;
      conversionFactor?: number;
    }
  ) {
    return unwrap<Unit>(await apiClient.patch(`/products/units/${encodeURIComponent(id)}`, input));
  },
  async deleteUnit(id: string) {
    return unwrap<{ message: string }>(
      await apiClient.delete(`/products/units/${encodeURIComponent(id)}`)
    );
  },
  async brands() {
    return unwrap<Brand[]>(await apiClient.get('/products/brands'));
  },
  async createBrand(input: { name: string; description?: string }) {
    return unwrap<Brand>(await apiClient.post('/products/brands', input));
  },
  async updateBrand(id: string, input: { name?: string; description?: string }) {
    return unwrap<Brand>(
      await apiClient.patch(`/products/brands/${encodeURIComponent(id)}`, input)
    );
  },
  async deleteBrand(id: string) {
    return unwrap<{ message: string }>(
      await apiClient.delete(`/products/brands/${encodeURIComponent(id)}`)
    );
  },
  async stock(id: string) {
    return unwrap<ProductStock>(await apiClient.get(`/products/${encodeURIComponent(id)}/stock`));
  },
  async suppliers() {
    const response = unwrap<{ data: SupplierOption[] }>(
      await apiClient.get('/suppliers-customers/suppliers?page=1&limit=100&status=ACTIVE')
    );
    return response.data;
  },
};

export function formatProductMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
