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
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerResponseDto,
  CustomerFilterDto,
  CustomerStatementDto,
} from './dto';

@Injectable()
export class CustomerService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
  ) {}

  /**
   * CREATE CUSTOMER
   * 1. Generate customer code if not provided
   * 2. Verify unique name + code
   * 3. Create customer
   * 4. Create contacts
   * 5. Create address
   */
  async createCustomer(
    businessId: string,
    userId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerResponseDto> {
    this.logger.log(`[CUSTOMERS] Creating customer: ${dto.name}`);

    // 1. Generate customer code
    const customerCode = dto.customerCode || (await this._generateCustomerCode(businessId));

    // 2. Check unique name + code
    const existing = await this.prisma.customer.findFirst({
      where: {
        businessId,
        OR: [{ name: dto.name }, { customerCode }],
      },
    });

    if (existing) {
      throw new ConflictException('Customer name or code already exists');
    }

    // 3. Create customer
    const customer = await this.prisma.customer.create({
      data: {
        id: uuid(),
        businessId,
        name: dto.name,
        customerCode,
        customerType: dto.customerType,
        description: dto.description,
        email: dto.email,
        phone: dto.phone,
        secondaryPhone: dto.secondaryPhone,
        taxId: dto.taxId,
        creditLimit: dto.creditLimit || 0,
        paymentTerms: dto.paymentTerms,
        openingBalance: dto.openingBalance || 0,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    // 4. Create contacts
    if (dto.contacts && dto.contacts.length > 0) {
      for (let i = 0; i < dto.contacts.length; i++) {
        const contact = dto.contacts[i];
        await this.prisma.customerContact.create({
          data: {
            id: uuid(),
            customerId: customer.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            position: contact.position,
            isPrimary: i === 0,
          },
        });
      }
    }

    // 5. Create address
    if (dto.address) {
      await this.prisma.customerAddress.create({
        data: {
          id: uuid(),
          customerId: customer.id,
          street: dto.address.street,
          city: dto.address.city,
          region: dto.address.region,
          postalCode: dto.address.postalCode,
          country: dto.address.country,
        },
      });
    }

    this.logger.log(`[CUSTOMERS] Customer created: ${customer.id} (Code: ${customerCode})`);

    return this.getCustomerById(businessId, customer.id);
  }

  /**
   * GET CUSTOMER BY ID
   */
  async getCustomerById(businessId: string, customerId: string): Promise<CustomerResponseDto> {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
      },
      include: {
        contacts: true,
        address: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Calculate financials
    const totalSales = await this._calculateCustomerSales(customerId);
    const totalPaid = await this._calculateCustomerPayments(customerId);

    return this._formatCustomerResponse(customer, customer.contacts || [], customer.address, {
      totalSales,
      totalPaid,
    });
  }

  /**
   * GET ALL CUSTOMERS
   * With filtering, search, pagination
   */
  async getAllCustomers(
    businessId: string,
    filter: CustomerFilterDto,
  ): Promise<{ data: CustomerResponseDto[]; total: number; page: number; limit: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter conditions
    const where: Prisma.CustomerWhereInput = {
      businessId,
      ...(filter.customerType && { customerType: filter.customerType }),
      ...(filter.paymentTerms && { paymentTerms: filter.paymentTerms }),
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' } },
          { customerCode: { contains: filter.search, mode: 'insensitive' } },
          { email: { contains: filter.search, mode: 'insensitive' } },
          { phone: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
    };

    // Filter by status
    if (filter.status) {
      if (filter.status === 'ACTIVE') {
        where.isActive = true;
      } else if (filter.status === 'INACTIVE') {
        where.isActive = false;
      }
      // OVERDUE will be filtered in memory
    }

    // Build sort
    let orderBy: Prisma.CustomerOrderByWithRelationInput = { createdAt: 'desc' };
    if (filter.sortBy) {
      const direction = filter.sortOrder === 'asc' ? 'asc' : 'desc';
      switch (filter.sortBy) {
        case 'name':
          orderBy = { name: direction };
          break;
        case 'outstanding':
          // Will sort in memory
          break;
        case 'lastSale':
          orderBy = { createdAt: direction };
          break;
        case 'createdAt':
          orderBy = { createdAt: direction };
          break;
      }
    }

    // Query customers
    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          contacts: true,
          address: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    // Get financials for all customers
    const customersWithFinancials = await Promise.all(
      customers.map(async (customer) => {
        const totalSales = await this._calculateCustomerSales(customer.id);
        const totalPaid = await this._calculateCustomerPayments(customer.id);

        return {
          customer,
          totalSales,
          totalPaid,
        };
      }),
    );

    // Format responses
    let results = customersWithFinancials.map((item) =>
      this._formatCustomerResponse(item.customer, item.customer.contacts || [], item.customer.address, {
        totalSales: item.totalSales,
        totalPaid: item.totalPaid,
      }),
    );

    // Apply overdue filter if needed
    if (filter.status === 'OVERDUE') {
      results = results.filter((c) => c.outstandingBalance > 0);
    }

    // Sort by outstanding if requested
    if (filter.sortBy === 'outstanding') {
      results.sort((a, b) => {
        const direction = filter.sortOrder === 'asc' ? 1 : -1;
        return (a.outstandingBalance - b.outstandingBalance) * direction;
      });
    }

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  /**
   * UPDATE CUSTOMER
   */
  async updateCustomer(
    businessId: string,
    customerId: string,
    userId: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    this.logger.log(`[CUSTOMERS] Updating customer: ${customerId}`);

    // Verify customer exists
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
      },
      include: {
        contacts: true,
        address: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Update customer
    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.customerType && { customerType: dto.customerType }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.email && { email: dto.email }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.secondaryPhone !== undefined && { secondaryPhone: dto.secondaryPhone }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
        ...(dto.paymentTerms && { paymentTerms: dto.paymentTerms }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    // Update contacts if provided
    if (dto.contacts && dto.contacts.length > 0) {
      await this.prisma.customerContact.deleteMany({
        where: { customerId },
      });

      for (let i = 0; i < dto.contacts.length; i++) {
        const contact = dto.contacts[i];
        await this.prisma.customerContact.create({
          data: {
            id: uuid(),
            customerId,
            firstName: contact.firstName || customer.contacts[0]?.firstName || '',
            lastName: contact.lastName || customer.contacts[0]?.lastName || '',
            email: contact.email || customer.contacts[0]?.email || '',
            phone: contact.phone || customer.contacts[0]?.phone || '',
            position: contact.position,
            isPrimary: i === 0,
          },
        });
      }
    }

    // Update address if provided
    if (dto.address) {
      if (customer.address) {
        await this.prisma.customerAddress.update({
          where: { id: customer.address.id },
          data: {
            ...(dto.address.street && { street: dto.address.street }),
            ...(dto.address.city && { city: dto.address.city }),
            ...(dto.address.region && { region: dto.address.region }),
            ...(dto.address.postalCode && { postalCode: dto.address.postalCode }),
            ...(dto.address.country !== undefined && { country: dto.address.country }),
          },
        });
      } else {
        await this.prisma.customerAddress.create({
          data: {
            id: uuid(),
            customerId,
            street: dto.address.street,
            city: dto.address.city,
            region: dto.address.region,
            postalCode: dto.address.postalCode,
            country: dto.address.country,
          },
        });
      }
    }

    this.logger.log(`[CUSTOMERS] Customer updated: ${customerId}`);

    return this.getCustomerById(businessId, customerId);
  }

  /**
   * DELETE CUSTOMER
   * Only if no sales invoices
   */
  async deleteCustomer(businessId: string, customerId: string, userId: string): Promise<{ message: string }> {
    this.logger.log(`[CUSTOMERS] Deleting customer: ${customerId}`);

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Check for sales invoices
    const invoiceCount = await this.prisma.salesInvoice.count({
      where: { customerId },
    });

    if (invoiceCount > 0) {
      throw new BadRequestException('Cannot delete customer with sales invoices');
    }

    // Delete contacts
    await this.prisma.customerContact.deleteMany({
      where: { customerId },
    });

    // Delete address
    await this.prisma.customerAddress.deleteMany({
      where: { customerId },
    });

    // Delete customer
    await this.prisma.customer.delete({
      where: { id: customerId },
    });

    this.logger.log(`[CUSTOMERS] Customer deleted: ${customerId}`);

    return { message: 'Customer deleted successfully' };
  }

  /**
   * GET CUSTOMER STATEMENT (Aging Report)
   */
  async getCustomerStatement(businessId: string, customerId: string, month?: string): Promise<CustomerStatementDto> {
    this.logger.log(`[CUSTOMERS] Getting statement for customer: ${customerId}`);

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const period = month || new Date().toISOString().slice(0, 7);

    // Get opening balance
    const openingBalance = customer.openingBalance || 0;

    // Get all transactions for the period
    const startDate = new Date(`${period}-01`);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);

    // Get sales invoices
    const salesInvoices = await this.prisma.salesInvoice.findMany({
      where: {
        customerId,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const sales = salesInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

    // Get payments
    const payments = await this.prisma.payment.findMany({
      where: {
        customerId,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

    // Build invoice list
    const invoices: {
      date: Date;
      invoiceNumber: string;
      amount: number;
      type: 'SALE' | 'PAYMENT' | 'RETURN';
    }[] = [];

    salesInvoices.forEach((inv) => {
      invoices.push({
        date: inv.createdAt,
        invoiceNumber: inv.invoiceNumber || inv.id,
        amount: inv.totalAmount,
        type: 'SALE',
      });
    });

    payments.forEach((p) => {
      invoices.push({
        date: p.createdAt,
        invoiceNumber: (p as any).paymentNumber || p.id,
        amount: p.amount,
        type: 'PAYMENT',
      });
    });

    // Sort by date
    invoices.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      customerId,
      customerName: customer.name,
      period,
      openingBalance,
      sales,
      payments: totalPayments,
      closingBalance: openingBalance + sales - totalPayments,
      invoices,
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Generate customer code
   */
  private async _generateCustomerCode(businessId: string): Promise<string> {
    const count = await this.prisma.customer.count({
      where: { businessId },
    });

    return `CUST-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Calculate total sales to customer
   */
  private async _calculateCustomerSales(customerId: string): Promise<number> {
    const result = await this.prisma.salesInvoice.aggregate({
      where: { customerId },
      _sum: {
        totalAmount: true,
      },
    });

    return result._sum.totalAmount || 0;
  }

  /**
   * Calculate total payments from customer
   */
  private async _calculateCustomerPayments(customerId: string): Promise<number> {
    const result = await this.prisma.payment.aggregate({
      where: { customerId },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount || 0;
  }

  /**
   * Format customer response
   */
  private _formatCustomerResponse(
    customer: any,
    contacts: any[],
    address: any,
    financials?: { totalSales: number; totalPaid: number },
  ): CustomerResponseDto {
    const totalSales = financials?.totalSales || 0;
    const totalPaid = financials?.totalPaid || 0;
    const openingBalance = customer.openingBalance || 0;
    const creditLimit = customer.creditLimit || 0;
    const outstandingBalance = openingBalance + totalSales - totalPaid;
    const creditUtilization = creditLimit > 0 ? (outstandingBalance / creditLimit) * 100 : 0;

    return {
      id: customer.id,
      businessId: customer.businessId,
      name: customer.name,
      customerCode: customer.customerCode,
      customerType: customer.customerType,
      description: customer.description,
      email: customer.email,
      phone: customer.phone,
      secondaryPhone: customer.secondaryPhone,
      address: address
        ? {
            id: address.id,
            street: address.street,
            city: address.city,
            region: address.region,
            postalCode: address.postalCode,
            country: address.country,
          }
        : undefined,
      contacts: (contacts || []).map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        position: c.position,
        isPrimary: c.isPrimary,
      })),
      taxId: customer.taxId,
      creditLimit,
      paymentTerms: customer.paymentTerms,
      openingBalance,
      totalSales,
      totalPaid,
      outstandingBalance,
      creditUtilization: Math.round(creditUtilization * 100) / 100,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
