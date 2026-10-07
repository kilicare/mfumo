import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import {
  BusinessSetupDto,
  UpdateBusinessProfileDto,
  BusinessProfileResponseDto,
  CreateLocationDto,
  UpdateLocationDto,
  LocationResponseDto,
  CreatePaymentMethodDto,
  PaymentMethodResponseDto,
  CreateExpenseCategoryDto,
  ExpenseCategoryResponseDto,
  UnitResponseDto,
  BusinessSetupResponseDto,
} from './dto';

@Injectable()
export class BusinessService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private logger: LoggerService,
  ) {}

  async setupBusiness(
    businessId: string,
    userId: string,
    dto: BusinessSetupDto,
  ): Promise<BusinessSetupResponseDto> {
    this.logger.log(`[BUSINESS] Setup initiated for business: ${businessId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || user.businessId !== businessId) {
      throw new ForbiddenException('Not authorized to setup this business');
    }

    const isOwner = user.userRoles.some(
      (ur) => ur.role.name === 'Owner' || ur.role.name === 'Admin',
    );
    if (!isOwner) {
      throw new ForbiddenException('Only Owner/Admin can setup business');
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (business.isSetupComplete) {
      throw new BadRequestException('Business is already setup');
    }

    const updatedBusiness = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        name: dto.businessName,
        description: dto.businessDescription,
        businessType: dto.businessType,
        currency: dto.currency,
        taxPercentage: dto.taxPercentage,
        costingMethod: dto.costingMethod,
        allowNegativeStock: dto.allowNegativeStock,
      },
    });

    let locationsCreated = 0;
    let paymentMethodsCreated = 0;
    let expenseCategoriesCreated = 0;
    let unitsCreated = 0;

    if (dto.locations && dto.locations.length > 0) {
      for (const loc of dto.locations) {
        const existingLocation = await this.prisma.location.findFirst({
          where: {
            businessId,
            code: loc.code,
          },
        });

        if (!existingLocation) {
          await this.prisma.location.create({
            data: {
              id: uuid(),
              businessId,
              name: loc.name,
              code: loc.code,
              type: loc.type,
              description: loc.description,
              managerId: userId,
              isActive: true,
            },
          });
          locationsCreated++;
        }
      }
    } else {
      await this.prisma.location.create({
        data: {
          id: uuid(),
          businessId,
          name: 'Main Warehouse',
          code: 'MAIN',
          type: 'WAREHOUSE',
          managerId: userId,
          isActive: true,
        },
      });
      locationsCreated = 1;
    }

    const defaultPaymentMethods = [
      'Cash',
      'Bank Transfer',
      'Cheque',
      'M-Pesa',
      'Tigo',
      'Airtel',
      'Credit',
    ];

    const paymentMethodsToCreate = dto.paymentMethods || defaultPaymentMethods;

    for (const method of paymentMethodsToCreate) {
      const existing = await this.prisma.paymentMethod.findFirst({
        where: {
          businessId,
          name: method,
        },
      });

      if (!existing) {
        await this.prisma.paymentMethod.create({
          data: {
            id: uuid(),
            businessId,
            name: method,
            isActive: true,
          },
        });
        paymentMethodsCreated++;
      }
    }

    const defaultExpenseCategories = [
      'Salary',
      'Transport',
      'Fuel',
      'Electricity',
      'Water',
      'Rent',
      'Internet',
      'Maintenance',
      'Marketing',
      'Insurance',
      'Tax',
      'Bank Charges',
      'Miscellaneous',
    ];

    const categoriesToCreate = dto.expenseCategories || defaultExpenseCategories;

    for (const category of categoriesToCreate) {
      const existing = await this.prisma.expenseCategory.findFirst({
        where: {
          businessId,
          name: category,
        },
      });

      if (!existing) {
        await this.prisma.expenseCategory.create({
          data: {
            id: uuid(),
            businessId,
            name: category,
            code: category
              .normalize('NFKD')
              .replace(/[\u0300-\u036f]/g, '')
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, '_')
              .replace(/^_+|_+$/g, '')
              .slice(0, 32),
            isActive: true,
          },
        });
        expenseCategoriesCreated++;
      }
    }

    const defaultUnits = [
      { name: 'Piece', symbol: 'Pcs' },
      { name: 'Bottle', symbol: 'Btl' },
      { name: 'Carton', symbol: 'Ctn' },
      { name: 'Kilogram', symbol: 'Kg' },
      { name: 'Litre', symbol: 'L' },
      { name: 'Dozen', symbol: 'Dz' },
      { name: 'Meter', symbol: 'M' },
      { name: 'Set', symbol: 'Set' },
      { name: 'Pair', symbol: 'Pr' },
      { name: 'Gram', symbol: 'G' },
      { name: 'Millilitre', symbol: 'Ml' },
    ];

    for (const unit of defaultUnits) {
      const existing = await this.prisma.unit.findFirst({
        where: {
          name: unit.name,
        },
      });

      if (!existing) {
        await this.prisma.unit.create({
          data: {
            id: uuid(),
            name: unit.name,
            symbol: unit.symbol,
            isActive: true,
          },
        });
        unitsCreated++;
      }
    }

    const roles = await this.prisma.role.findMany({
      where: { businessId },
    });

    const permissions = await this.prisma.permission.findMany();

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        isSetupComplete: true,
      },
    });

    this.logger.log(
      `[BUSINESS] Setup complete for business: ${businessId} (${locationsCreated} locations, ${paymentMethodsCreated} payment methods, ${expenseCategoriesCreated} expense categories)`,
    );

    return {
      message: 'Business setup completed successfully',
      business: {
        id: updatedBusiness.id,
        name: updatedBusiness.name,
        businessType: updatedBusiness.businessType,
        currency: updatedBusiness.currency,
        taxPercentage: updatedBusiness.taxPercentage,
        costingMethod: updatedBusiness.costingMethod,
        allowNegativeStock: updatedBusiness.allowNegativeStock,
        requireApprovalForDiscounts: false,
        requireApprovalForReturns: false,
        isSetupComplete: updatedBusiness.isSetupComplete,
      },
      locationsCreated,
      paymentMethodsCreated,
      expenseCategoriesCreated,
      unitsCreated,
      rolesCreated: roles.length,
      permissionsCreated: permissions.length,
    };
  }

  async getBusinessProfile(businessId: string): Promise<BusinessProfileResponseDto> {
    this.logger.log(`[BUSINESS] Fetching profile for business: ${businessId}`);

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return {
      id: business.id,
      name: business.name,
      businessType: business.businessType,
      description: business.description,
      email: business.email,
      phone: business.phone,
      address: business.address,
      website: business.website,
      currency: business.currency,
      taxPercentage: business.taxPercentage,
      allowNegativeStock: business.allowNegativeStock,
      requireApprovalForDiscounts: false,
      requireApprovalForReturns: false,
      costingMethod: business.costingMethod,
      isSetupComplete: business.isSetupComplete,
      isActive: business.isActive,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };
  }

  async updateBusinessProfile(
    businessId: string,
    userId: string,
    dto: UpdateBusinessProfileDto,
  ): Promise<BusinessProfileResponseDto> {
    this.logger.log(`[BUSINESS] Updating profile for business: ${businessId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (user.businessId !== businessId) {
      throw new ForbiddenException('Not authorized to update this business');
    }

    const isOwner = user.userRoles.some(
      (ur) => ur.role.name === 'Owner' || ur.role.name === 'Admin',
    );
    if (!isOwner) {
      throw new ForbiddenException('Only Owner/Admin can update business settings');
    }

    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...((dto.name || dto.businessName) && { name: dto.name || dto.businessName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.businessDescription !== undefined && {
          description: dto.businessDescription,
        }),
        ...(dto.taxPercentage !== undefined && { taxPercentage: dto.taxPercentage }),
        ...(dto.allowNegativeStock !== undefined && {
          allowNegativeStock: dto.allowNegativeStock,
        }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.costingMethod && { costingMethod: dto.costingMethod }),
      },
    });

    this.logger.log(`[BUSINESS] Profile updated for business: ${businessId}`);

    return {
      id: updated.id,
      name: updated.name,
      businessType: updated.businessType,
      description: updated.description,
      email: updated.email,
      phone: updated.phone,
      address: updated.address,
      website: updated.website,
      currency: updated.currency,
      taxPercentage: updated.taxPercentage,
      allowNegativeStock: updated.allowNegativeStock,
      requireApprovalForDiscounts: false,
      requireApprovalForReturns: false,
      costingMethod: updated.costingMethod,
      isSetupComplete: updated.isSetupComplete,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async createLocation(
    businessId: string,
    userId: string,
    dto: CreateLocationDto,
  ): Promise<LocationResponseDto> {
    this.logger.log(`[BUSINESS] Creating location for business: ${businessId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || user.businessId !== businessId) {
      throw new ForbiddenException('Not authorized');
    }

    const hasPermission = user.userRoles.some(
      (ur) => ur.role.name === 'Owner' || ur.role.name === 'Admin',
    );
    if (!hasPermission) {
      throw new ForbiddenException('Only Owner/Admin can create locations');
    }

    const code = dto.code || `LOC_${Date.now().toString().slice(-6)}`;
    const type = dto.type || 'WAREHOUSE';

    const existing = await this.prisma.location.findFirst({
      where: {
        businessId,
        code,
      },
    });

    if (existing) {
      throw new ConflictException(`Location with code ${code} already exists`);
    }

    const location = await this.prisma.location.create({
      data: {
        id: uuid(),
        businessId,
        name: dto.name,
        code,
        type,
        address: dto.address,
        description: dto.description,
        managerId: userId,
        isActive: true,
      },
    });

    return {
      id: location.id,
      businessId: location.businessId,
      name: location.name,
      code: location.code,
      type: location.type,
      description: location.description,
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }

  async getLocations(businessId: string): Promise<LocationResponseDto[]> {
    const locations = await this.prisma.location.findMany({
      where: { businessId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return locations.map((loc) => ({
      id: loc.id,
      businessId: loc.businessId,
      name: loc.name,
      code: loc.code,
      type: loc.type,
      description: loc.description,
      isActive: loc.isActive,
      createdAt: loc.createdAt,
      updatedAt: loc.updatedAt,
    }));
  }

  async updateLocation(
    businessId: string,
    locationId: string,
    userId: string,
    dto: UpdateLocationDto,
  ): Promise<LocationResponseDto> {
    this.logger.log(`[BUSINESS] Updating location: ${locationId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (user.businessId !== businessId) {
      throw new ForbiddenException('Not authorized');
    }

    const hasPermission = user.userRoles.some(
      (ur) => ur.role.name === 'Owner' || ur.role.name === 'Admin',
    );
    if (!hasPermission) {
      throw new ForbiddenException('Only Owner/Admin can update locations');
    }

    const location = await this.prisma.location.findFirst({
      where: {
        id: locationId,
        businessId,
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    if (dto.code && dto.code !== location.code) {
      const existing = await this.prisma.location.findFirst({
        where: {
          businessId,
          code: dto.code,
        },
      });

      if (existing) {
        throw new ConflictException(`Location with code ${dto.code} already exists`);
      }
    }

    const updated = await this.prisma.location.update({
      where: { id: locationId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.code && { code: dto.code }),
        ...(dto.type && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    return {
      id: updated.id,
      businessId: updated.businessId,
      name: updated.name,
      code: updated.code,
      type: updated.type,
      description: updated.description,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async createPaymentMethod(
    businessId: string,
    userId: string,
    dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    this.logger.log(`[BUSINESS] Creating payment method for business: ${businessId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (user.businessId !== businessId) {
      throw new ForbiddenException('Not authorized');
    }

    const hasPermission = user.userRoles.some(
      (ur) => ur.role.name === 'Owner' || ur.role.name === 'Admin',
    );
    if (!hasPermission) {
      throw new ForbiddenException('Only Owner/Admin can create payment methods');
    }

    const existing = await this.prisma.paymentMethod.findFirst({
      where: {
        businessId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException(`Payment method ${dto.name} already exists`);
    }

    const method = await this.prisma.paymentMethod.create({
      data: {
        id: uuid(),
        businessId,
        name: dto.name,
        description: dto.description || dto.provider,
        isActive: true,
      },
    });

    return {
      id: method.id,
      businessId: method.businessId,
      name: method.name,
      description: method.description,
      isActive: method.isActive,
      createdAt: method.createdAt,
    };
  }

  async getPaymentMethods(businessId: string): Promise<PaymentMethodResponseDto[]> {
    const methods = await this.prisma.paymentMethod.findMany({
      where: { businessId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return methods.map((m) => ({
      id: m.id,
      businessId: m.businessId,
      name: m.name,
      description: m.description,
      isActive: m.isActive,
      createdAt: m.createdAt,
    }));
  }

  async createExpenseCategory(
    businessId: string,
    userId: string,
    dto: CreateExpenseCategoryDto,
  ): Promise<ExpenseCategoryResponseDto> {
    this.logger.log(`[BUSINESS] Creating expense category for business: ${businessId}`);

    const cleanName = dto.name?.trim();
    if (!cleanName) throw new BadRequestException('Category name is required');
    if ((dto.budgetLimit == null) !== (dto.budgetPeriod == null)) {
      throw new BadRequestException('budgetLimit and budgetPeriod must be configured together');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || user.businessId !== businessId) {
      throw new ForbiddenException('Not authorized');
    }

    const categoryCode = (dto.code || cleanName)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    if (!categoryCode)
      throw new BadRequestException('Category code must contain letters or numbers');
    let category;
    try {
      category = await this.prisma.$transaction(async (tx) => {
        const created = await tx.expenseCategory.create({
          data: {
            id: uuid(),
            businessId,
            name: cleanName,
            code: categoryCode,
            description: dto.description,
            budgetLimit: dto.budgetLimit,
            budgetPeriod: dto.budgetPeriod,
            isActive: true,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            entityType: 'ExpenseCategory',
            entityId: created.id,
            action: 'CREATE',
            afterData: JSON.stringify(created),
            description: 'CREATE ExpenseCategory',
          },
        });
        return created;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictException(
          'Expense category name or code already exists in this business',
        );
      }
      throw error;
    }

    return {
      id: category.id,
      businessId: category.businessId,
      name: category.name,
      code: category.code,
      description: category.description,
      budgetLimit: category.budgetLimit,
      budgetPeriod: category.budgetPeriod as ExpenseCategoryResponseDto['budgetPeriod'],
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  async getExpenseCategories(businessId: string): Promise<ExpenseCategoryResponseDto[]> {
    const categories = await this.prisma.expenseCategory.findMany({
      where: { businessId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return categories.map((c) => ({
      id: c.id,
      businessId: c.businessId,
      name: c.name,
      code: c.code,
      description: c.description,
      budgetLimit: c.budgetLimit,
      budgetPeriod: c.budgetPeriod as ExpenseCategoryResponseDto['budgetPeriod'],
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getUnits(businessId: string): Promise<UnitResponseDto[]> {
    const units = await this.prisma.unit.findMany({
      where: { isActive: true, OR: [{ businessId: null }, { businessId }] },
      orderBy: { createdAt: 'asc' },
    });

    return units.map((u) => ({
      id: u.id,
      businessId: u.businessId,
      name: u.name,
      symbol: u.symbol,
      description: u.description,
      baseUnit: u.baseUnit,
      conversionFactor: u.conversionFactor,
      isSystem: u.isSystem || u.businessId === null,
      isActive: u.isActive,
    }));
  }

  async getSetupStatus(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const [locations, paymentMethods, expenseCategories, units] = await Promise.all([
      this.prisma.location.count({ where: { businessId, isActive: true } }),
      this.prisma.paymentMethod.count({ where: { businessId, isActive: true } }),
      this.prisma.expenseCategory.count({ where: { businessId, isActive: true } }),
      this.prisma.unit.count({
        where: { isActive: true, OR: [{ businessId: null }, { businessId }] },
      }),
    ]);

    return {
      isSetupComplete: business.isSetupComplete,
      locationsConfigured: locations,
      paymentMethodsConfigured: paymentMethods,
      expenseCategoriesConfigured: expenseCategories,
      unitsAvailable: units,
      setupStep: business.isSetupComplete ? 'COMPLETE' : 'PENDING',
    };
  }
}
