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
import { CreateUnitDto, UpdateUnitDto } from '../business/dto/unit.dto';
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
    const productImages = this.decodeProductImages(dto.images) ?? [];

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, businessId, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: dto.brandId, isActive: true, OR: [{ businessId: null }, { businessId }] },
      });
      if (!brand) throw new NotFoundException('Brand not found');
    }

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, businessId, isActive: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }

    const defaultUnit = await this.prisma.unit.findFirst({
      where: { id: dto.defaultUnitId, isActive: true, OR: [{ businessId: null }, { businessId }] },
    });
    if (!defaultUnit) throw new NotFoundException('Default unit not found');

    const productUnits = dto.productUnits?.length
      ? dto.productUnits
      : [{ unitId: dto.defaultUnitId, conversionFactor: 1, isDefault: true }];
    const unitIds = new Set(productUnits.map((unit) => unit.unitId));
    if (unitIds.size !== productUnits.length) {
      throw new BadRequestException('A unit can only be added once to a product');
    }
    if (
      !productUnits.some((unit) => unit.unitId === dto.defaultUnitId && unit.isDefault) ||
      productUnits.filter((unit) => unit.isDefault).length !== 1
    ) {
      throw new BadRequestException(
        'Select exactly one product default unit and match it to the default unit field',
      );
    }
    if (
      productUnits.some((unit) => unit.unitId === dto.defaultUnitId && unit.conversionFactor !== 1)
    ) {
      throw new BadRequestException('The base unit conversion factor must be 1');
    }
    const activeUnitCount = await this.prisma.unit.count({
      where: {
        id: { in: [...unitIds] },
        isActive: true,
        OR: [{ businessId: null }, { businessId }],
      },
    });
    if (activeUnitCount !== unitIds.size)
      throw new NotFoundException('One or more units not found');

    const existingSku = await this.prisma.product.findFirst({
      where: { businessId, sku: dto.sku },
    });

    if (existingSku) {
      throw new ConflictException(`SKU ${dto.sku} already exists`);
    }

    if (dto.sellingPrice < dto.buyingPrice) {
      throw new BadRequestException('Selling price cannot be less than buying price');
    }

    const minimumStock = dto.minimumStock ?? 10;
    const reorderLevel = dto.reorderLevel ?? 15;
    if (minimumStock > reorderLevel) {
      throw new BadRequestException('Reorder level must be at least the minimum stock level');
    }

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            id: uuid(),
            businessId,
            sku: dto.sku,
            name: dto.name,
            description: dto.description,
            categoryId: dto.categoryId,
            brandId: dto.brandId,
            supplierId: dto.supplierId,
            buyingPrice: dto.buyingPrice,
            sellingPrice: dto.sellingPrice,
            wholesalePrice: dto.wholesalePrice,
            defaultUnitId: dto.defaultUnitId,
            minimumStock,
            reorderLevel,
            status: dto.status || 'ACTIVE',
            barcode: dto.barcode,
            manufacturer: dto.manufacturer,
            weight: dto.weight,
            color: dto.color,
            size: dto.size,
            expiryDays: dto.expiryDays,
            requiresExpiry: dto.requiresExpiry || false,
          },
          include: {
            category: true,
            brand: true,
            supplier: true,
            business: { select: { currency: true } },
            units: { include: { unit: true } },
          },
        });

        await tx.productUnit.createMany({
          data: productUnits.map((unit) => ({
            id: uuid(),
            productId: created.id,
            unitId: unit.unitId,
            conversionFactor: unit.conversionFactor,
            isDefault: unit.isDefault,
          })),
        });

        const locations = await tx.location.findMany({
          where: { businessId, isActive: true },
          select: { id: true },
        });
        if (locations.length) {
          await tx.stockBalance.createMany({
            data: locations.map((location) => ({
              id: uuid(),
              productId: created.id,
              locationId: location.id,
              quantity: 0,
            })),
          });
        }
        if (productImages.length) {
          await tx.productImage.createMany({
            data: productImages.map((data, sortOrder) => ({
              id: uuid(),
              businessId,
              productId: created.id,
              data,
              contentType: 'image/webp',
              sortOrder,
              isPrimary: sortOrder === 0,
            })),
          });
        }
        const result = await tx.product.findFirstOrThrow({
          where: { id: created.id, businessId },
          include: {
            category: true,
            brand: true,
            supplier: true,
            business: { select: { currency: true } },
            units: { include: { unit: true } },
            images: {
              select: { id: true, sortOrder: true, isPrimary: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });
        await this.audit(tx, businessId, userId, 'CREATE', 'PRODUCT', result.id, null, {
          sku: result.sku,
          name: result.name,
          categoryId: result.categoryId,
          supplierId: result.supplierId,
          brandId: result.brandId,
          buyingPrice: result.buyingPrice,
          sellingPrice: result.sellingPrice,
          defaultUnitId: result.defaultUnitId,
          productUnits,
          imageCount: productImages.length,
        });
        return result;
      });

      this.logger.log(`[PRODUCTS] Product created: ${product.id} (SKU: ${dto.sku})`);
      return this._formatProductResponse(
        product,
        product.category,
        product.brand,
        product.supplier,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('SKU or barcode already exists');
      }
      throw error;
    }
  }

  async getProductById(businessId: string, productId: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: {
        category: true,
        brand: true,
        supplier: true,
        business: { select: { currency: true } },
        units: {
          include: { unit: true },
        },
        images: {
          select: { id: true, sortOrder: true, isPrimary: true },
          orderBy: { sortOrder: 'asc' },
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
      ...this._formatProductResponse(product, product.category, product.brand, product.supplier),
      currentStock: totalStock,
    };
  }

  async getProductImage(businessId: string, productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, businessId, productId, product: { businessId } },
      select: { data: true, contentType: true },
    });
    if (!image) throw new NotFoundException('Product image not found');
    return image;
  }

  async getUnits(businessId: string) {
    return this.prisma.unit.findMany({
      where: { isActive: true, OR: [{ businessId: null }, { businessId }] },
      orderBy: { name: 'asc' },
    });
  }

  async createUnit(businessId: string, dto: CreateUnitDto) {
    const name = dto.name.trim();
    const symbol = dto.symbol.trim();
    if (!name || !symbol) throw new BadRequestException('Unit name and symbol are required');
    const duplicate = await this.prisma.unit.findFirst({
      where: {
        isActive: true,
        OR: [{ businessId: null }, { businessId }],
        AND: [
          {
            OR: [
              { name: { equals: name, mode: 'insensitive' } },
              { symbol: { equals: symbol, mode: 'insensitive' } },
            ],
          },
        ],
      },
    });
    if (duplicate)
      throw new ConflictException('A standard or business unit already uses this name or symbol');
    try {
      return await this.prisma.unit.create({
        data: {
          id: uuid(),
          businessId,
          name,
          symbol,
          description: dto.description?.trim() || undefined,
          baseUnit: dto.baseUnit?.trim() || undefined,
          conversionFactor: dto.conversionFactor ?? 1,
          isActive: true,
          isSystem: false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Unit name or symbol already exists in this business');
      throw error;
    }
  }

  async updateUnit(businessId: string, unitId: string, dto: UpdateUnitDto) {
    const current = await this.prisma.unit.findFirst({
      where: { id: unitId, businessId, isSystem: false },
    });
    if (!current) throw new NotFoundException('Business unit not found');
    const name = dto.name?.trim();
    const symbol = dto.symbol?.trim();
    if (name === '' || symbol === '')
      throw new BadRequestException('Unit name and symbol cannot be blank');
    if (name || symbol) {
      const duplicate = await this.prisma.unit.findFirst({
        where: {
          id: { not: unitId },
          isActive: true,
          OR: [{ businessId: null }, { businessId }],
          AND: [
            {
              OR: [
                ...(name ? [{ name: { equals: name, mode: 'insensitive' as const } }] : []),
                ...(symbol ? [{ symbol: { equals: symbol, mode: 'insensitive' as const } }] : []),
              ],
            },
          ],
        },
      });
      if (duplicate)
        throw new ConflictException('A standard or business unit already uses this name or symbol');
    }
    try {
      return await this.prisma.unit.update({
        where: { id: unitId },
        data: {
          ...(name !== undefined && { name }),
          ...(symbol !== undefined && { symbol }),
          ...(dto.description !== undefined && { description: dto.description.trim() || null }),
          ...(dto.baseUnit !== undefined && { baseUnit: dto.baseUnit.trim() || null }),
          ...(dto.conversionFactor !== undefined && { conversionFactor: dto.conversionFactor }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Unit name or symbol already exists in this business');
      throw error;
    }
  }

  async deleteUnit(businessId: string, unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, businessId, isSystem: false },
    });
    if (!unit) throw new NotFoundException('Business unit not found');
    const productCount = await this.prisma.productUnit.count({ where: { unitId } });
    if (productCount)
      throw new BadRequestException(
        `This unit is used by ${productCount} product(s); remove it from products before deleting`,
      );
    await this.prisma.unit.delete({ where: { id: unitId } });
    return { message: 'Unit deleted successfully' };
  }

  async getProductStock(businessId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      select: { id: true, sku: true, name: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const [balances, movements] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: { productId, location: { businessId } },
        include: { location: { select: { id: true, name: true, code: true } } },
        orderBy: { location: { name: 'asc' } },
      }),
      this.prisma.inventoryMovement.findMany({
        where: { productId, businessId },
        include: { location: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      product,
      totalQuantity: balances.reduce((total, balance) => total + balance.quantity, 0),
      locations: balances.map(({ location, quantity, lastMovementAt }) => ({
        locationId: location.id,
        locationName: location.name,
        locationCode: location.code,
        quantity,
        lastMovementAt,
      })),
      recentMovements: movements.map(
        ({ id, type, quantity, referenceType, referenceId, notes, createdAt, location }) => ({
          id,
          type,
          quantity,
          referenceType,
          referenceId,
          notes,
          createdAt,
          locationId: location.id,
          locationName: location.name,
        }),
      ),
    };
  }

  async getAllProducts(
    businessId: string,
    filter: ProductFilterDto,
  ): Promise<{ data: ProductResponseDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const skip = (page - 1) * limit;

    const minPrice = filter.minPrice === undefined ? undefined : Number(filter.minPrice);
    const maxPrice = filter.maxPrice === undefined ? undefined : Number(filter.maxPrice);
    if (
      (minPrice !== undefined && !Number.isFinite(minPrice)) ||
      (maxPrice !== undefined && !Number.isFinite(maxPrice))
    ) {
      throw new BadRequestException('Price filters must be valid numbers');
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw new BadRequestException('Minimum price cannot exceed maximum price');
    }

    const searchTerm = filter.search?.trim();
    const exactBarcodeProduct = searchTerm
      ? await this.prisma.product.findFirst({
          where: {
            businessId,
            barcode: { equals: searchTerm, mode: 'insensitive' },
          },
          select: { id: true },
        })
      : null;

    const where: Prisma.ProductWhereInput = {
      businessId,
      ...(filter.status && { status: filter.status }),
      ...(filter.categoryId && { categoryId: filter.categoryId }),
      ...(filter.brandId && { brandId: filter.brandId }),
      ...(filter.supplierId && { supplierId: filter.supplierId }),
      ...(searchTerm &&
        (exactBarcodeProduct
          ? { id: exactBarcodeProduct.id }
          : {
              OR: [
                { sku: { contains: searchTerm, mode: 'insensitive' } },
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { barcode: { contains: searchTerm, mode: 'insensitive' } },
              ],
            })),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        sellingPrice: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
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
        case 'createdAt':
          orderBy = { createdAt: direction };
          break;
      }
    }

    const include: Prisma.ProductInclude = {
      category: true,
      brand: true,
      supplier: true,
      business: { select: { currency: true } },
      units: { include: { unit: true } },
      images: {
        select: { id: true, sortOrder: true, isPrimary: true },
        orderBy: { sortOrder: 'asc' },
      },
    };
    let products: Array<Prisma.ProductGetPayload<{ include: typeof include }>>;
    let total: number;

    if (filter.stockStatus) {
      const candidates = await this.prisma.product.findMany({ where, include, orderBy });
      const candidateBalances = await this.prisma.stockBalance.findMany({
        where: {
          productId: { in: candidates.map((product) => product.id) },
          location: { businessId },
        },
        select: { productId: true, quantity: true },
      });
      const stockById = new Map<string, number>();
      for (const balance of candidateBalances)
        stockById.set(
          balance.productId,
          (stockById.get(balance.productId) ?? 0) + balance.quantity,
        );
      const matching = candidates.filter((product) => {
        const stock = stockById.get(product.id) ?? 0;
        switch (filter.stockStatus) {
          case 'BELOW_MINIMUM':
            return stock < product.minimumStock;
          case 'LOW_STOCK':
            return stock >= product.minimumStock && stock < product.reorderLevel;
          case 'NORMAL':
            return stock >= product.reorderLevel && stock <= product.reorderLevel * 2;
          case 'OVERSTOCKED':
            return stock > product.reorderLevel * 2;
          default:
            return true;
        }
      });
      total = matching.length;
      products = matching.slice(skip, skip + limit);
    } else {
      [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include,
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);
    }

    const stockBalances = await this.prisma.stockBalance.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
        location: { businessId },
      },
    });

    const stockByProductId = new Map<string, number>();
    stockBalances.forEach((sb) => {
      const current = stockByProductId.get(sb.productId) || 0;
      stockByProductId.set(sb.productId, current + sb.quantity);
    });

    const filtered = products.map((p) => ({
      ...this._formatProductResponse(p, p.category, p.brand, p.supplier),
      currentStock: stockByProductId.get(p.id) || 0,
    }));

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
    const productImages = this.decodeProductImages(dto.images);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: {
        category: true,
        brand: true,
        units: {
          include: { unit: true },
        },
        images: { select: { id: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const buyingPrice = dto.buyingPrice ?? product.buyingPrice;
    const sellingPrice = dto.sellingPrice ?? product.sellingPrice;
    if (sellingPrice < buyingPrice)
      throw new BadRequestException('Selling price cannot be less than buying price');

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, businessId, isActive: true },
      });
      if (!category) throw new NotFoundException('Category not found');
    }
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, businessId, isActive: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }
    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: dto.brandId, isActive: true, OR: [{ businessId: null }, { businessId }] },
      });
      if (!brand) throw new NotFoundException('Brand not found');
    }

    const minimumStock = dto.minimumStock ?? product.minimumStock;
    const reorderLevel = dto.reorderLevel ?? product.reorderLevel;
    if (minimumStock > reorderLevel)
      throw new BadRequestException('Reorder level must be at least the minimum stock level');

    const unitListChanged = dto.productUnits !== undefined || dto.defaultUnitId !== undefined;
    const newDefaultUnitId = dto.defaultUnitId ?? product.defaultUnitId;
    const units =
      dto.productUnits ??
      (dto.defaultUnitId
        ? [{ unitId: newDefaultUnitId, conversionFactor: 1, isDefault: true }]
        : undefined);
    if (units) {
      const uniqueUnitIds = new Set(units.map((unit) => unit.unitId));
      if (uniqueUnitIds.size !== units.length)
        throw new BadRequestException('A unit can only be added once to a product');
      if (
        !units.some((unit) => unit.unitId === newDefaultUnitId && unit.isDefault) ||
        units.filter((unit) => unit.isDefault).length !== 1
      ) {
        throw new BadRequestException(
          'Select exactly one product default unit and match it to the default unit field',
        );
      }
      if (units.some((unit) => unit.unitId === newDefaultUnitId && unit.conversionFactor !== 1)) {
        throw new BadRequestException('The base unit conversion factor must be 1');
      }
      const unitCount = await this.prisma.unit.count({
        where: {
          id: { in: [...uniqueUnitIds] },
          isActive: true,
          OR: [{ businessId: null }, { businessId }],
        },
      });
      if (unitCount !== uniqueUnitIds.size)
        throw new NotFoundException('One or more units not found');
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
            ...(dto.brandId !== undefined && { brandId: dto.brandId || null }),
            ...(dto.supplierId !== undefined && { supplierId: dto.supplierId || null }),
            ...(dto.buyingPrice !== undefined && { buyingPrice: dto.buyingPrice }),
            ...(dto.sellingPrice !== undefined && { sellingPrice: dto.sellingPrice }),
            ...(dto.wholesalePrice !== undefined && { wholesalePrice: dto.wholesalePrice }),
            ...(dto.defaultUnitId !== undefined && { defaultUnitId: newDefaultUnitId }),
            ...(dto.minimumStock !== undefined && { minimumStock }),
            ...(dto.reorderLevel !== undefined && { reorderLevel }),
            ...(dto.status !== undefined && { status: dto.status }),
            ...(dto.barcode !== undefined && { barcode: dto.barcode || null }),
            ...(dto.manufacturer !== undefined && { manufacturer: dto.manufacturer }),
            ...(dto.weight !== undefined && { weight: dto.weight }),
            ...(dto.color !== undefined && { color: dto.color }),
            ...(dto.size !== undefined && { size: dto.size }),
            ...(dto.expiryDays !== undefined && { expiryDays: dto.expiryDays }),
            ...(dto.requiresExpiry !== undefined && { requiresExpiry: dto.requiresExpiry }),
          },
        });
        if (unitListChanged && units) {
          await tx.productUnit.deleteMany({ where: { productId } });
          await tx.productUnit.createMany({
            data: units.map((unit) => ({
              id: uuid(),
              productId,
              unitId: unit.unitId,
              conversionFactor: unit.conversionFactor,
              isDefault: unit.isDefault,
            })),
          });
        }
        if (productImages !== undefined) {
          await tx.productImage.deleteMany({ where: { businessId, productId } });
          if (productImages.length) {
            await tx.productImage.createMany({
              data: productImages.map((data, sortOrder) => ({
                id: uuid(),
                businessId,
                productId,
                data,
                contentType: 'image/webp',
                sortOrder,
                isPrimary: sortOrder === 0,
              })),
            });
          }
        }
        const result = await tx.product.findFirstOrThrow({
          where: { id: productId, businessId },
          include: {
            category: true,
            brand: true,
            supplier: true,
            business: { select: { currency: true } },
            units: { include: { unit: true } },
            images: {
              select: { id: true, sortOrder: true, isPrimary: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });
        await this.audit(
          tx,
          businessId,
          userId,
          'UPDATE',
          'PRODUCT',
          productId,
          {
            name: product.name,
            categoryId: product.categoryId,
            supplierId: product.supplierId,
            brandId: product.brandId,
            buyingPrice: product.buyingPrice,
            sellingPrice: product.sellingPrice,
            status: product.status,
            defaultUnitId: product.defaultUnitId,
            imageCount: product.images.length,
          },
          {
            name: result.name,
            categoryId: result.categoryId,
            supplierId: result.supplierId,
            brandId: result.brandId,
            buyingPrice: result.buyingPrice,
            sellingPrice: result.sellingPrice,
            status: result.status,
            defaultUnitId: result.defaultUnitId,
            imageCount: result.images.length,
          },
        );
        return result;
      });
      this.logger.log(`[PRODUCTS] Product updated: ${productId}`);
      return this._formatProductResponse(
        updated,
        updated.category,
        updated.brand,
        updated.supplier,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Barcode already exists');
      }
      throw error;
    }
  }

  async deleteProduct(
    businessId: string,
    productId: string,
    userId: string,
  ): Promise<{ message: string }> {
    this.logger.log(`[PRODUCTS] Deleting product: ${productId}`);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [
      movements,
      purchaseItems,
      invoiceItems,
      returnItems,
      adjustmentItems,
      auditItems,
      transferItems,
      countItems,
    ] = await Promise.all([
      this.prisma.inventoryMovement.count({ where: { productId, businessId } }),
      this.prisma.purchaseOrderItem.count({ where: { productId } }),
      this.prisma.salesInvoiceItem.count({ where: { productId } }),
      this.prisma.salesReturnItem.count({ where: { productId } }),
      this.prisma.stockAdjustmentItem.count({ where: { productId } }),
      this.prisma.stockAuditItem.count({ where: { productId } }),
      this.prisma.stockTransferItem.count({ where: { productId } }),
      this.prisma.physicalCountItem.count({ where: { productId } }),
    ]);
    if (
      [
        movements,
        purchaseItems,
        invoiceItems,
        returnItems,
        adjustmentItems,
        auditItems,
        transferItems,
        countItems,
      ].some((count) => count > 0)
    ) {
      throw new BadRequestException(
        'This product has operational history. Mark it as DISCONTINUED instead of deleting it.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.delete({ where: { id: productId } });
      await this.audit(
        tx,
        businessId,
        userId,
        'DELETE',
        'PRODUCT',
        productId,
        {
          sku: product.sku,
          name: product.name,
          status: product.status,
        },
        null,
      );
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

        await this.prisma.$transaction(async (tx) => {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              ...(item.buyingPrice !== undefined && { buyingPrice: item.buyingPrice }),
              ...(item.sellingPrice !== undefined && { sellingPrice: item.sellingPrice }),
              ...(item.wholesalePrice !== undefined && { wholesalePrice: item.wholesalePrice }),
            },
          });
          await this.audit(
            tx,
            businessId,
            userId,
            'BULK_PRICE_UPDATE',
            'PRODUCT',
            item.productId,
            {
              buyingPrice: product.buyingPrice,
              sellingPrice: product.sellingPrice,
              wholesalePrice: product.wholesalePrice,
            },
            {
              buyingPrice,
              sellingPrice,
              wholesalePrice: item.wholesalePrice ?? product.wholesalePrice,
            },
          );
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

    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findMany({
        where: { id: { in: dto.productIds }, businessId },
        select: { id: true, status: true },
      });
      const updated = await tx.product.updateMany({
        where: { id: { in: before.map((product) => product.id) }, businessId },
        data: { status: dto.status },
      });
      for (const product of before) {
        await this.audit(
          tx,
          businessId,
          userId,
          'BULK_STATUS_UPDATE',
          'PRODUCT',
          product.id,
          { status: product.status },
          { status: dto.status },
        );
      }
      return updated;
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
        where: { id: dto.parentCategoryId, businessId, isActive: true },
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
      include: { parentCategory: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const productCounts = await Promise.all(
      categories.map((cat) =>
        this.prisma.product.count({
          where: { categoryId: cat.id, businessId },
        }),
      ),
    );

    return categories.map((cat, idx) => ({
      id: cat.id,
      businessId: cat.businessId,
      name: cat.name,
      description: cat.description,
      parentCategoryId: cat.parentCategoryId,
      parentCategoryName: cat.parentCategory?.name,
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

    if (dto.parentCategoryId !== undefined && dto.parentCategoryId !== null) {
      if (dto.parentCategoryId === categoryId)
        throw new BadRequestException('A category cannot be its own parent');
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentCategoryId, businessId, isActive: true },
      });
      if (!parent) throw new NotFoundException('Parent category not found');
      let ancestorId: string | null = parent.parentCategoryId;
      const visited = new Set<string>([categoryId, parent.id]);
      while (ancestorId) {
        if (visited.has(ancestorId))
          throw new BadRequestException('This parent would create a category cycle');
        visited.add(ancestorId);
        const ancestor: { parentCategoryId: string | null } | null =
          await this.prisma.category.findFirst({
            where: { id: ancestorId, businessId },
            select: { parentCategoryId: true },
          });
        ancestorId = ancestor?.parentCategoryId ?? null;
      }
    }

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentCategoryId !== undefined && {
          parentCategoryId: dto.parentCategoryId || null,
        }),
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
    void userId;
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Brand name is required');
    const existing = await this.prisma.brand.findFirst({
      where: {
        isActive: true,
        OR: [{ businessId: null }, { businessId }],
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (existing)
      throw new ConflictException(`Brand ${name} already exists in the available catalog`);
    try {
      const brand = await this.prisma.brand.create({
        data: {
          id: uuid(),
          businessId,
          name,
          description: dto.description?.trim() || undefined,
          isActive: true,
        },
      });
      return {
        id: brand.id,
        businessId: brand.businessId,
        name: brand.name,
        description: brand.description,
        productCount: 0,
        isActive: brand.isActive,
        createdAt: brand.createdAt,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(`Brand ${name} already exists in this business`);
      throw error;
    }
  }

  async getBrands(businessId: string): Promise<BrandResponseDto[]> {
    const brands = await this.prisma.brand.findMany({
      where: { isActive: true, OR: [{ businessId: null }, { businessId }] },
      orderBy: [{ businessId: 'asc' }, { name: 'asc' }],
    });
    const productCounts = await Promise.all(
      brands.map((brand) =>
        this.prisma.product.count({ where: { brandId: brand.id, businessId } }),
      ),
    );
    return brands.map((brand, index) => ({
      id: brand.id,
      businessId: brand.businessId,
      name: brand.name,
      description: brand.description,
      productCount: productCounts[index],
      isActive: brand.isActive,
      createdAt: brand.createdAt,
    }));
  }

  async updateBrand(
    businessId: string,
    brandId: string,
    userId: string,
    dto: UpdateBrandDto,
  ): Promise<BrandResponseDto> {
    void userId;
    const brand = await this.prisma.brand.findFirst({ where: { id: brandId, businessId } });
    if (!brand) throw new NotFoundException('Brand not found');
    const name = dto.name?.trim();
    if (name === '') throw new BadRequestException('Brand name cannot be blank');
    if (name) {
      const duplicate = await this.prisma.brand.findFirst({
        where: {
          id: { not: brandId },
          isActive: true,
          OR: [{ businessId: null }, { businessId }],
          name: { equals: name, mode: 'insensitive' },
        },
      });
      if (duplicate)
        throw new ConflictException(`Brand ${name} already exists in the available catalog`);
    }
    try {
      const updated = await this.prisma.brand.update({
        where: { id: brandId },
        data: {
          ...(name !== undefined && { name }),
          ...(dto.description !== undefined && { description: dto.description.trim() || null }),
        },
      });
      const productCount = await this.prisma.product.count({ where: { brandId, businessId } });
      return {
        id: updated.id,
        businessId: updated.businessId,
        name: updated.name,
        description: updated.description,
        productCount,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Brand name already exists in this business');
      throw error;
    }
  }

  async deleteBrand(businessId: string, brandId: string): Promise<{ message: string }> {
    const brand = await this.prisma.brand.findFirst({ where: { id: brandId, businessId } });
    if (!brand) throw new NotFoundException('Brand not found');
    const productCount = await this.prisma.product.count({ where: { brandId, businessId } });
    if (productCount)
      throw new BadRequestException(
        `Cannot delete this brand while ${productCount} product(s) use it`,
      );
    await this.prisma.brand.delete({ where: { id: brandId } });
    return { message: 'Brand deleted successfully' };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private _formatProductResponse(
    product: any,
    category: any,
    brand: any,
    supplier?: any,
  ): ProductResponseDto {
    // Gross margin is profit as a share of selling price. Markup would use
    // buyingPrice as the denominator and is a different percentage.
    const margin =
      product.sellingPrice > 0
        ? ((product.sellingPrice - product.buyingPrice) / product.sellingPrice) * 100
        : 0;

    return {
      id: product.id,
      businessId: product.businessId,
      currency: product.business?.currency || 'TZS',
      sku: product.sku,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: category?.name,
      brandId: product.brandId,
      brandName: brand?.name,
      supplierId: product.supplierId,
      supplierName: supplier?.name,
      buyingPrice: product.buyingPrice,
      sellingPrice: product.sellingPrice,
      wholesalePrice: product.wholesalePrice,
      margin: Math.round(margin * 100) / 100,
      defaultUnitId: product.defaultUnitId,
      defaultUnit: product.units?.find((unit: any) => unit.isDefault)?.unit?.name || '',
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
      images:
        product.images?.map((image: any) => ({
          id: image.id,
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
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

  private decodeProductImages(images?: string[]): Buffer[] | undefined {
    if (images === undefined) return undefined;
    if (!Array.isArray(images) || images.length > 5) {
      throw new BadRequestException('A product can have at most five images');
    }
    return images.map((value) => {
      const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      if (!match) throw new BadRequestException('Product images must be valid WebP data URLs');
      const data = Buffer.from(match[1], 'base64');
      if (
        data.length < 16 ||
        data.length > 128 * 1024 ||
        data.toString('ascii', 0, 4) !== 'RIFF' ||
        data.readUInt32LE(4) !== data.length - 8 ||
        data.toString('ascii', 8, 12) !== 'WEBP' ||
        !['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16))
      ) {
        throw new BadRequestException(
          'Product image is invalid or exceeds 128 KB after compression',
        );
      }
      return data;
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    businessId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        businessId,
        userId,
        action,
        entityType,
        entityId,
        beforeData: before == null ? null : JSON.stringify(before),
        afterData: after == null ? null : JSON.stringify(after),
        description: `${action} ${entityType} ${entityId}`,
      },
    });
  }
}
