import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateBrandDto,
  UpdateBrandDto,
  ProductResponseDto,
  CategoryResponseDto,
  BrandResponseDto,
  BulkUpdatePriceDto,
  BulkUpdateStatusDto,
  BulkImportProductsDto,
  ProductFilterDto,
} from './dto';

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
  ) {}

  // ============================================================
  // PRODUCTS
  // ============================================================

  async createProduct(
    businessId: string,
    userId: string,
    dto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    this.logger.log(`[PRODUCTS] Creating product: ${dto.sku} for business: ${businessId}`);

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, businessId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({
        where: { id: dto.brandId },
      });

      if (!brand) {
        throw new NotFoundException('Brand not found');
      }
    }

    const existingSku = await this.prisma.product.findFirst({
      where: { businessId, sku: dto.sku },
    });

    if (existingSku) {
      throw new ConflictException(`SKU ${dto.sku} already exists`);
    }

    if (dto.sellingPrice < dto.buyingPrice) {
      throw new BadRequestException('Selling price cannot be less than buying price');
    }

    const product = await this.prisma.product.create({
      data: {
        id: uuid(),
        businessId,
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        buyingPrice: dto.buyingPrice,
        sellingPrice: dto.sellingPrice,
        wholesalePrice: dto.wholesalePrice,
        defaultUnitId: dto.defaultUnitId,
        minimumStock: dto.minimumStock || 10,
        reorderLevel: dto.reorderLevel || 5,
        status: dto.status || 'ACTIVE',
        barcode: dto.barcode,
        manufacturer: dto.manufacturer,
        weight: dto.weight,
        color: dto.color,
        size: dto.size,
        expiryDays: dto.expiryDays,
        requiresExpiry: dto.requiresExpiry || false,
      },
    });

    if (dto.productUnits && dto.productUnits.length > 0) {
      for (const pu of dto.productUnits) {
        await this.prisma.productUnit.create({
          data: {
            id: uuid(),
            productId: product.id,
            unitId: pu.unitId,
            conversionFactor: pu.conversionFactor,
            isDefault: pu.isDefault,
          },
        });
      }
    } else {
      await this.prisma.productUnit.create({
        data: {
          id: uuid(),
          productId: product.id,
          unitId: dto.defaultUnitId,
          conversionFactor: 1,
          isDefault: true,
        },
      });
    }

    const locations = await this.prisma.location.findMany({
      where: { businessId, isActive: true },
    });

    for (const location of locations) {
      await this.prisma.stockBalance.create({
        data: {
          id: uuid(),
          productId: product.id,
          locationId: location.id,
          quantity: 0,
          lastMovementAt: new Date(),
        },
      });
    }

    this.logger.log(`[PRODUCTS] Product created: ${product.id} (SKU: ${dto.sku})`);

    return this._formatProductResponse(product, category, null);
  }

  async getProductById(businessId: string, productId: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: {
        category: true,
        brand: true,
        units: {
          include: { unit: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const stockBalances = await this.prisma.stockBalance.findMany({
      where: { productId },
    });

    const totalStock = stockBalances.reduce((sum, sb) => sum + sb.quantity, 0);

    return {
      ...this._formatProductResponse(product, product.category, product.brand),
      currentStock: totalStock,
    };
  }

  async getAllProducts(
    businessId: string,
    filter: ProductFilterDto,
  ): Promise<{ data: ProductResponseDto[]; total: number; page: number; limit: number }> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      businessId,
      ...(filter.status && { status: filter.status }),
      ...(filter.categoryId && { categoryId: filter.categoryId }),
      ...(filter.brandId && { brandId: filter.brandId }),
      ...(filter.search && {
        OR: [
          { sku: { contains: filter.search, mode: 'insensitive' } },
          { name: { contains: filter.search, mode: 'insensitive' } },
          { barcode: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
      ...(filter.minPrice && {
        sellingPrice: { gte: parseFloat(filter.minPrice) },
      }),
      ...(filter.maxPrice && {
        sellingPrice: { lte: parseFloat(filter.maxPrice) },
      }),
    };

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    if (filter.sortBy) {
      const direction = filter.sortOrder === 'asc' ? 'asc' : 'desc';
      switch (filter.sortBy) {
        case 'name':
          orderBy = { name: direction };
          break;
        case 'price':
          orderBy = { sellingPrice: direction };
          break;
        case 'margin':
          orderBy = { createdAt: direction };
          break;
        case 'createdAt':
          orderBy = { createdAt: direction };
          break;
      }
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          units: {
            include: { unit: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const stockBalances = await this.prisma.stockBalance.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
      },
    });

    const stockByProductId = new Map<string, number>();
    stockBalances.forEach((sb) => {
      const current = stockByProductId.get(sb.productId) || 0;
      stockByProductId.set(sb.productId, current + sb.quantity);
    });

    let filtered = products.map((p) => ({
      ...this._formatProductResponse(p, p.category, p.brand),
      currentStock: stockByProductId.get(p.id) || 0,
    }));

    if (filter.stockStatus) {
      filtered = filtered.filter((p) => {
        const stockLevel = p.currentStock || 0;
        switch (filter.stockStatus) {
          case 'BELOW_MINIMUM':
            return stockLevel < p.minimumStock;
          case 'LOW_STOCK':
            return stockLevel >= p.minimumStock && stockLevel < p.reorderLevel;
          case 'NORMAL':
            return stockLevel >= p.reorderLevel;
          case 'OVERSTOCKED':
            return stockLevel > p.reorderLevel * 2;
          default:
            return true;
        }
      });
    }

    return {
      data: filtered,
      total,
      page,
      limit,
    };
  }

  async updateProduct(
    businessId: string,
    productId: string,
    userId: string,
    dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    this.logger.log(`[PRODUCTS] Updating product: ${productId}`);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: {
        category: true,
        brand: true,
        units: {
          include: { unit: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const buyingPrice = dto.buyingPrice ?? product.buyingPrice;
    const sellingPrice = dto.sellingPrice ?? product.sellingPrice;

    if (sellingPrice < buyingPrice) {
      throw new BadRequestException('Selling price cannot be less than buying price');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.brandId !== undefined && { brandId: dto.brandId }),
        ...(dto.buyingPrice !== undefined && { buyingPrice: dto.buyingPrice }),
        ...(dto.sellingPrice !== undefined && { sellingPrice: dto.sellingPrice }),
        ...(dto.wholesalePrice !== undefined && { wholesalePrice: dto.wholesalePrice }),
        ...(dto.defaultUnitId && { defaultUnitId: dto.defaultUnitId }),
        ...(dto.minimumStock !== undefined && { minimumStock: dto.minimumStock }),
        ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
        ...(dto.status && { status: dto.status }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.manufacturer !== undefined && { manufacturer: dto.manufacturer }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.size !== undefined && { size: dto.size }),
        ...(dto.expiryDays !== undefined && { expiryDays: dto.expiryDays }),
      },
      include: {
        category: true,
        brand: true,
      },
    });

    if (dto.productUnits && dto.productUnits.length > 0) {
      await this.prisma.productUnit.deleteMany({
        where: { productId },
      });

      for (const pu of dto.productUnits) {
        await this.prisma.productUnit.create({
          data: {
            id: uuid(),
            productId,
            unitId: pu.unitId,
            conversionFactor: pu.conversionFactor,
            isDefault: pu.isDefault,
          },
        });
      }
    }

    this.logger.log(`[PRODUCTS] Product updated: ${productId}`);

    return this._formatProductResponse(updated, updated.category, updated.brand);
  }

  async deleteProduct(businessId: string, productId: string): Promise<{ message: string }> {
    this.logger.log(`[PRODUCTS] Deleting product: ${productId}`);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const movements = await this.prisma.inventoryMovement.findFirst({
      where: { productId },
    });

    if (movements) {
      throw new BadRequestException(
        'Cannot delete product with stock movements. Mark as DISCONTINUED instead.',
      );
    }

    await this.prisma.productUnit.deleteMany({
      where: { productId },
    });

    await this.prisma.stockBalance.deleteMany({
      where: { productId },
    });

    await this.prisma.product.delete({
      where: { id: productId },
    });

    this.logger.log(`[PRODUCTS] Product deleted: ${productId}`);

    return { message: 'Product deleted successfully' };
  }

  async bulkUpdatePrices(businessId: string, userId: string, dto: BulkUpdatePriceDto) {
    this.logger.log(`[PRODUCTS] Bulk updating prices for ${dto.items.length} products`);

    const results = [];

    for (const item of dto.items) {
      try {
        const product = await this.prisma.product.findFirst({
          where: { id: item.productId, businessId },
        });

        if (!product) {
          results.push({ productId: item.productId, success: false, error: 'Product not found' });
          continue;
        }

        const buyingPrice = item.buyingPrice ?? product.buyingPrice;
        const sellingPrice = item.sellingPrice ?? product.sellingPrice;

        if (sellingPrice < buyingPrice) {
          results.push({
            productId: item.productId,
            success: false,
            error: 'Selling price cannot be less than buying price',
          });
          continue;
        }

        await this.prisma.product.update({
          where: { id: item.productId },
          data: {
            ...(item.buyingPrice !== undefined && { buyingPrice: item.buyingPrice }),
            ...(item.sellingPrice !== undefined && { sellingPrice: item.sellingPrice }),
            ...(item.wholesalePrice !== undefined && { wholesalePrice: item.wholesalePrice }),
          },
        });

        results.push({ productId: item.productId, success: true });
      } catch (error) {
        results.push({ productId: item.productId, success: false, error: error.message });
      }
    }

    this.logger.log(
      `[PRODUCTS] Bulk price update completed: ${results.filter((r) => r.success).length}/${results.length} successful`,
    );

    return {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      details: results,
    };
  }

  async bulkUpdateStatus(businessId: string, userId: string, dto: BulkUpdateStatusDto) {
    this.logger.log(`[PRODUCTS] Bulk updating status for ${dto.productIds.length} products`);

    const result = await this.prisma.product.updateMany({
      where: {
        id: { in: dto.productIds },
        businessId,
      },
      data: { status: dto.status },
    });

    this.logger.log(`[PRODUCTS] Status updated for ${result.count} products`);

    return {
      message: `Status updated for ${result.count} products`,
      count: result.count,
    };
  }

  async bulkImportProducts(businessId: string, userId: string, dto: BulkImportProductsDto) {
    this.logger.log(`[PRODUCTS] Bulk importing ${dto.products.length} products`);

    const results = [];

    for (const productDto of dto.products) {
      try {
        const result = await this.createProduct(businessId, userId, productDto);
        results.push({ sku: productDto.sku, success: true, productId: result.id });
      } catch (error) {
        results.push({ sku: productDto.sku, success: false, error: error.message });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(`[PRODUCTS] Bulk import completed: ${successful}/${results.length} successful`);

    return {
      total: results.length,
      successful,
      failed,
      details: results,
    };
  }

  // ============================================================
  // CATEGORIES
  // ============================================================

  async createCategory(
    businessId: string,
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    this.logger.log(`[PRODUCTS] Creating category: ${dto.name}`);

    if (dto.parentCategoryId) {
      const parentCategory = await this.prisma.category.findFirst({
        where: { id: dto.parentCategoryId, businessId },
      });

      if (!parentCategory) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const existing = await this.prisma.category.findFirst({
      where: { businessId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Category ${dto.name} already exists`);
    }

    const category = await this.prisma.category.create({
      data: {
        id: uuid(),
        businessId,
        name: dto.name,
        description: dto.description,
        parentCategoryId: dto.parentCategoryId,
        isActive: true,
      },
    });

    return {
      id: category.id,
      businessId: category.businessId,
      name: category.name,
      description: category.description,
      parentCategoryId: category.parentCategoryId,
      productCount: 0,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  async getCategories(businessId: string): Promise<CategoryResponseDto[]> {
    const categories = await this.prisma.category.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const productCounts = await Promise.all(
      categories.map((cat) =>
        this.prisma.product.count({
          where: { categoryId: cat.id },
        }),
      ),
    );

    return categories.map((cat, idx) => ({
      id: cat.id,
      businessId: cat.businessId,
      name: cat.name,
      description: cat.description,
      parentCategoryId: cat.parentCategoryId,
      parentCategoryName: '',
      productCount: productCounts[idx],
      isActive: cat.isActive,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    }));
  }

  async getCategoryHierarchy(businessId: string) {
    const categories = await this.prisma.category.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const buildTree = (parentId: string | null = null): any[] => {
      return categories
        .filter((c) => c.parentCategoryId === parentId)
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          children: buildTree(c.id),
        }));
    };

    return buildTree();
  }

  async updateCategory(
    businessId: string,
    categoryId: string,
    userId: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    this.logger.log(`[PRODUCTS] Updating category: ${categoryId}`);

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, businessId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.name && dto.name !== category.name) {
      const existing = await this.prisma.category.findFirst({
        where: { businessId, name: dto.name },
      });

      if (existing) {
        throw new ConflictException(`Category ${dto.name} already exists`);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentCategoryId !== undefined && { parentCategoryId: dto.parentCategoryId }),
      },
    });

    const productCount = await this.prisma.product.count({
      where: { categoryId },
    });

    return {
      id: updated.id,
      businessId: updated.businessId,
      name: updated.name,
      description: updated.description,
      parentCategoryId: updated.parentCategoryId,
      productCount,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteCategory(businessId: string, categoryId: string): Promise<{ message: string }> {
    this.logger.log(`[PRODUCTS] Deleting category: ${categoryId}`);

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, businessId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const productCount = await this.prisma.product.count({
      where: { categoryId },
    });

    if (productCount > 0) {
      throw new BadRequestException(`Cannot delete category with ${productCount} products`);
    }

    const subCategoryCount = await this.prisma.category.count({
      where: { parentCategoryId: categoryId },
    });

    if (subCategoryCount > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${subCategoryCount} sub-categories`,
      );
    }

    await this.prisma.category.delete({
      where: { id: categoryId },
    });

    this.logger.log(`[PRODUCTS] Category deleted: ${categoryId}`);

    return { message: 'Category deleted successfully' };
  }

  // ============================================================
  // BRANDS
  // ============================================================

  async createBrand(
    businessId: string,
    userId: string,
    dto: CreateBrandDto,
  ): Promise<BrandResponseDto> {
    this.logger.log(`[PRODUCTS] Creating brand: ${dto.name}`);

    const existing = await this.prisma.brand.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Brand ${dto.name} already exists`);
    }

    const brand = await this.prisma.brand.create({
      data: {
        id: uuid(),
        name: dto.name,
        description: dto.description,
        isActive: true,
      },
    });

    return {
      id: brand.id,
      name: brand.name,
      description: brand.description,
      productCount: 0,
      isActive: brand.isActive,
      createdAt: brand.createdAt,
    };
  }

  async getBrands(): Promise<BrandResponseDto[]> {
    const brands = await this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const productCounts = await Promise.all(
      brands.map((brand) =>
        this.prisma.product.count({
          where: { brandId: brand.id },
        }),
      ),
    );

    return brands.map((brand, idx) => ({
      id: brand.id,
      name: brand.name,
      description: brand.description,
      productCount: productCounts[idx],
      isActive: brand.isActive,
      createdAt: brand.createdAt,
    }));
  }

  async updateBrand(
    brandId: string,
    userId: string,
    dto: UpdateBrandDto,
  ): Promise<BrandResponseDto> {
    this.logger.log(`[PRODUCTS] Updating brand: ${brandId}`);

    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (dto.name && dto.name !== brand.name) {
      const existing = await this.prisma.brand.findFirst({
        where: { name: dto.name },
      });

      if (existing) {
        throw new ConflictException(`Brand ${dto.name} already exists`);
      }
    }

    const updated = await this.prisma.brand.update({
      where: { id: brandId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    const productCount = await this.prisma.product.count({
      where: { brandId },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      productCount,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    };
  }

  async deleteBrand(brandId: string): Promise<{ message: string }> {
    this.logger.log(`[PRODUCTS] Deleting brand: ${brandId}`);

    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const productCount = await this.prisma.product.count({
      where: { brandId },
    });

    if (productCount > 0) {
      throw new BadRequestException(`Cannot delete brand with ${productCount} products`);
    }

    await this.prisma.brand.delete({
      where: { id: brandId },
    });

    this.logger.log(`[PRODUCTS] Brand deleted: ${brandId}`);

    return { message: 'Brand deleted successfully' };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private _formatProductResponse(product: any, category: any, brand: any): ProductResponseDto {
    const margin = ((product.sellingPrice - product.buyingPrice) / product.buyingPrice) * 100;

    return {
      id: product.id,
      businessId: product.businessId,
      sku: product.sku,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: category?.name,
      brandId: product.brandId,
      brandName: brand?.name,
      buyingPrice: product.buyingPrice,
      sellingPrice: product.sellingPrice,
      wholesalePrice: product.wholesalePrice,
      margin: Math.round(margin * 100) / 100,
      defaultUnitId: product.defaultUnitId,
      defaultUnit: '',
      productUnits:
        product.units?.map((pu: any) => ({
          id: pu.id,
          productId: pu.productId,
          unitId: pu.unitId,
          unitName: pu.unit?.name,
          unitSymbol: pu.unit?.symbol,
          conversionFactor: pu.conversionFactor,
          isDefault: pu.isDefault,
        })) || [],
      minimumStock: product.minimumStock,
      reorderLevel: product.reorderLevel,
      status: product.status,
      barcode: product.barcode,
      manufacturer: product.manufacturer,
      weight: product.weight,
      color: product.color,
      size: product.size,
      expiryDays: product.expiryDays,
      requiresExpiry: product.requiresExpiry,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
