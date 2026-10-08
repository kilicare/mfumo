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
    const financials = await this._calculateCustomerFinancials(businessId, customerId);

    return this._formatCustomerResponse(customer, customer.contacts || [], customer.address, {
      ...financials,
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
        const financials = await this._calculateCustomerFinancials(businessId, customer.id);

        return {
          customer,
          ...financials,
        };
      }),
    );

    // Format responses
    let results = customersWithFinancials.map((item) =>
      this._formatCustomerResponse(
        item.customer,
        item.customer.contacts || [],
        item.customer.address,
        {
          totalSales: item.totalSales,
          totalPaid: item.totalPaid,
          totalReturned: item.totalReturned,
        },
      ),
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
  async deleteCustomer(
    businessId: string,
    customerId: string,
    userId: string,
  ): Promise<{ message: string }> {
    this.logger.log(`[CUSTOMERS] Deleting customer: ${customerId}`);

    await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, businessId },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      const invoiceCount = await tx.salesInvoice.count({
        where: { customerId, businessId },
      });

      if (invoiceCount > 0) {
        throw new BadRequestException('Cannot delete customer with sales invoices');
      }

      await tx.customerContact.deleteMany({ where: { customerId } });
      await tx.customerAddress.deleteMany({ where: { customerId } });
      await tx.customer.delete({ where: { id: customerId } });
      await tx.auditLog.create({
        data: {
          businessId,
          userId,
          action: 'DELETE',
          entityType: 'CUSTOMER',
          entityId: customerId,
          description: `Deleted customer ${customerId}`,
        },
      });
    });

    this.logger.log(`[CUSTOMERS] Customer deleted: ${customerId}`);

    return { message: 'Customer deleted successfully' };
  }

  /**
   * GET CUSTOMER STATEMENT (Aging Report)
   */
  async getCustomerStatement(
    businessId: string,
    customerId: string,
    month?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<CustomerStatementDto> {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if ((dateFrom && !dateTo) || (!dateFrom && dateTo))
      throw new BadRequestException('Provide both dateFrom and dateTo');
    if ((month && (dateFrom || dateTo)) || (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)))
      throw new BadRequestException('Provide a valid month or a dateFrom/dateTo range');
    const startDate = dateFrom
      ? this.statementDate(dateFrom, false)
      : month
        ? new Date(`${month}-01T00:00:00.000Z`)
        : new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`);
    const endDate = dateTo
      ? this.statementDate(dateTo, true)
      : new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
    if (startDate >= endDate) throw new BadRequestException('dateFrom must be on or before dateTo');
    const invoiceFilter = {
      businessId,
      customerId,
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
    };
    const returnFilter = {
      businessId,
      status: { in: ['RECEIVED', 'COMPLETED'] },
      invoice: { businessId, customerId },
    };
    const paymentFilter = {
      businessId,
      customerId,
      status: { in: ['RECORDED', 'VERIFIED', 'RECONCILED', 'COMPLETED'] },
    };
    const [periodSales, priorSales, periodPayments, priorPayments, periodReturns, priorReturns] =
      await Promise.all([
        this.prisma.salesInvoice.findMany({
          where: { ...invoiceFilter, issuedDate: { gte: startDate, lt: endDate } },
          select: { invoiceNumber: true, totalAmount: true, issuedDate: true },
        }),
        this.prisma.salesInvoice.aggregate({
          where: { ...invoiceFilter, issuedDate: { lt: startDate } },
          _sum: { totalAmount: true },
        }),
        this.prisma.payment.findMany({
          where: { ...paymentFilter, paymentDate: { gte: startDate, lt: endDate } },
          select: { paymentNumber: true, amount: true, paymentDate: true },
        }),
        this.prisma.payment.aggregate({
          where: { ...paymentFilter, paymentDate: { lt: startDate } },
          _sum: { amount: true },
        }),
        this.prisma.salesReturn.findMany({
          where: { ...returnFilter, returnDate: { gte: startDate, lt: endDate } },
          select: { returnNumber: true, totalAmount: true, returnDate: true },
        }),
        this.prisma.salesReturn.aggregate({
          where: { ...returnFilter, returnDate: { lt: startDate } },
          _sum: { totalAmount: true },
        }),
      ]);
    const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const sales = roundMoney(periodSales.reduce((sum, row) => sum + row.totalAmount, 0));
    const totalPayments = roundMoney(periodPayments.reduce((sum, row) => sum + row.amount, 0));
    const returns = roundMoney(periodReturns.reduce((sum, row) => sum + row.totalAmount, 0));
    const openingBalance = roundMoney(
      (customer.openingBalance || 0) +
        (priorSales._sum.totalAmount || 0) -
        (priorPayments._sum.amount || 0) -
        (priorReturns._sum.totalAmount || 0),
    );
    const entries: CustomerStatementDto['invoices'] = [
      ...periodSales
        .filter((row) => row.issuedDate)
        .map((row) => ({
          date: row.issuedDate!,
          invoiceNumber: row.invoiceNumber,
          amount: row.totalAmount,
          type: 'SALE' as const,
        })),
      ...periodPayments.map((row) => ({
        date: row.paymentDate,
        invoiceNumber: row.paymentNumber,
        amount: row.amount,
        type: 'PAYMENT' as const,
      })),
      ...periodReturns.map((row) => ({
        date: row.returnDate,
        invoiceNumber: row.returnNumber,
        amount: row.totalAmount,
        type: 'RETURN' as const,
      })),
    ].sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() || a.invoiceNumber.localeCompare(b.invoiceNumber),
    );
    const period =
      dateFrom && dateTo
        ? `${dateFrom} to ${dateTo}`
        : month || startDate.toISOString().slice(0, 7);
    return {
      customerId,
      customerName: customer.name,
      period,
      openingBalance,
      sales,
      payments: totalPayments,
      returns,
      closingBalance: roundMoney(openingBalance + sales - totalPayments - returns),
      invoices: entries,
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private statementDate(value: string, exclusiveEnd: boolean): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new BadRequestException('Dates must use YYYY-MM-DD');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw new BadRequestException('Invalid calendar date');
    if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

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
  private async _calculateCustomerFinancials(businessId: string, customerId: string) {
    const [sales, payments, returns] = await Promise.all([
      this.prisma.salesInvoice.aggregate({
        where: {
          businessId,
          customerId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          businessId,
          customerId,
          status: { in: ['RECORDED', 'VERIFIED', 'RECONCILED', 'COMPLETED'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.salesReturn.aggregate({
        where: {
          businessId,
          status: { in: ['RECEIVED', 'COMPLETED'] },
          OR: [{ customerId }, { customerId: null, invoice: { customerId } }],
        },
        _sum: { totalAmount: true },
      }),
    ]);
    return {
      totalSales: sales._sum.totalAmount || 0,
      totalPaid: payments._sum.amount || 0,
      totalReturned: returns._sum.totalAmount || 0,
    };
  }

  /**
   * Format customer response
   */
  private _formatCustomerResponse(
    customer: any,
    contacts: any[],
    address: any,
    financials?: { totalSales: number; totalPaid: number; totalReturned: number },
  ): CustomerResponseDto {
    const totalSales = financials?.totalSales || 0;
    const totalPaid = financials?.totalPaid || 0;
    const totalReturned = financials?.totalReturned || 0;
    const openingBalance = customer.openingBalance || 0;
    const creditLimit = customer.creditLimit || 0;
    const outstandingBalance = openingBalance + totalSales - totalPaid - totalReturned;
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
      totalReturned,
      outstandingBalance,
      creditUtilization: Math.round(creditUtilization * 100) / 100,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
