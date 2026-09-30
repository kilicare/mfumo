import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { LoggerService } from '../common/logger/logger.service';
import { PrismaService } from '../database/prisma.service';
import { assertAccountingPeriodOpen } from '../common/utils/accounting-period.util';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto';
import {
  ApplyDiscountDto,
  CreateSalesInvoiceDto,
  CreateSalesReturnDto,
  SalesCancelDto,
  SalesInvoiceFilterDto,
  SalesInvoiceResponseDto,
  SalesPaymentDto,
  SalesPaymentResponseDto,
  SalesRejectDto,
  SalesReturnFilterDto,
  SalesReturnResponseDto,
  UpdateSalesInvoiceDto,
} from './dto';

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const termsDays: Record<string, number> = {
  'NET-7': 7,
  'NET-14': 14,
  'NET-30': 30,
  'NET-45': 45,
  'NET-60': 60,
  COD: 0,
  PREPAID: 0,
};
const invoiceInclude = {
  customer: true,
  location: true,
  items: { include: { product: true } },
  payments: { select: { amount: true, status: true } },
  returns: { select: { status: true, totalAmount: true } },
} satisfies Prisma.SalesInvoiceInclude;
type InvoiceDetails = Prisma.SalesInvoiceGetPayload<{ include: typeof invoiceInclude }>;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
  ) {}

  async createSalesInvoice(
    businessId: string,
    userId: string,
    dto: CreateSalesInvoiceDto,
  ): Promise<SalesInvoiceResponseDto> {
    this.exclusiveDiscount(dto.discountAmount, dto.discountPercentage);
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, businessId, isActive: true },
    });
    if (!customer) throw new NotFoundException('Active customer not found');
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, businessId, isActive: true },
    });
    if (!location) throw new NotFoundException('Active location not found');
    const terms = dto.paymentTerms || customer.paymentTerms;
    if (!Object.prototype.hasOwnProperty.call(termsDays, terms))
      throw new BadRequestException('Invalid payment terms');
    const lines = await this.prepareLines(businessId, dto.items);
    const subtotal = money(lines.reduce((sum, line) => sum + line.total, 0));
    const discount = this.discountFor(subtotal, dto.discountAmount, dto.discountPercentage);
    const taxAmount = money(dto.taxAmount || 0);
    const totalAmount = money(subtotal - discount.amount + taxAmount);
    if (totalAmount < 0) throw new BadRequestException('Invoice total cannot be negative');
    const invoiceDate = dto.invoiceDate ? this.parseInvoiceDate(dto.invoiceDate) : new Date();
    const dueDate = dto.dueDate
      ? this.parseInvoiceDate(dto.dueDate, true)
      : this.dueDate(invoiceDate, terms);
    if (dueDate < invoiceDate)
      throw new BadRequestException('Due date cannot be before invoice date');
    const salespersonId = dto.salespersonId || userId;
    const salesperson = await this.prisma.user.findFirst({
      where: { id: salespersonId, businessId, isActive: true },
      select: { id: true },
    });
    if (!salesperson) throw new NotFoundException('Active salesperson not found');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customer.id} AND "businessId" = ${businessId} FOR UPDATE`;
        if (!['COD', 'PREPAID'].includes(terms)) {
          const outstanding = await this.customerOutstanding(
            tx,
            businessId,
            customer.id,
            customer.openingBalance,
          );
          if (outstanding + totalAmount > customer.creditLimit + 1e-8)
            throw new BadRequestException('Invoice would exceed the customer credit limit');
        }
        const invoiceNumber = dto.invoiceNumber || (await this.nextInvoiceNumber(tx, businessId));
        const invoice = await tx.salesInvoice.create({
          data: {
            id: uuid(),
            businessId,
            customerId: customer.id,
            locationId: location.id,
            invoiceNumber,
            invoiceDate,
            dueDate,
            status: 'DRAFT',
            subtotal,
            discountAmount: discount.amount,
            discountPercent: discount.percentage,
            taxAmount,
            totalAmount,
            totalPaid: 0,
            balance: totalAmount,
            paymentTerms: terms,
            salespersonId: salesperson.id,
            referenceNumber: dto.referenceNumber,
            notes: dto.notes,
            attachments: dto.attachments ? JSON.stringify(dto.attachments) : null,
            createdBy: userId,
          },
        });
        await tx.salesInvoiceItem.createMany({
          data: lines.map((line, index) => ({
            id: uuid(),
            invoiceId: invoice.id,
            lineNo: index + 1,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            discountPercentage: line.discountPercentage,
            total: line.total,
            batchNumber: line.batchNumber,
            expiryDate: line.expiryDate,
            notes: line.notes,
          })),
        });
        await this.audit(tx, businessId, userId, 'SalesInvoice', invoice.id, 'CREATE', null, {
          invoiceNumber,
          customerId: customer.id,
          totalAmount,
        });
        return invoice.id;
      });
    } catch (error) {
      if (this.uniqueViolation(error)) throw new ConflictException('Invoice number already exists');
      throw error;
    }
    this.logger.log(`[SALES] Invoice created: ${id}`);
    const created = await this.getSalesInvoiceById(businessId, id);
    await this.notifications.publishEvent({
      businessId,
      eventType: NotificationEventType.INVOICE_CREATED,
      referenceId: id,
      referenceType: 'SalesInvoice',
      variables: {
        invoiceNumber: created.invoiceNumber,
        customerName: created.customerName,
        totalAmount: created.totalAmount,
      },
    });
    return created;
  }

  async getSalesInvoiceById(
    businessId: string,
    invoiceId: string,
  ): Promise<SalesInvoiceResponseDto> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, businessId },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Sales invoice not found');
    return this.mapInvoice(invoice);
  }

  async getAllSalesInvoices(businessId: string, filter: SalesInvoiceFilterDto) {
    const page = Math.max(1, Math.floor(Number(filter.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(filter.limit) || 20)));
    const invoiceDate: Prisma.DateTimeFilter = {};
    if (filter.dateFrom) invoiceDate.gte = this.dateBound(filter.dateFrom, false);
    if (filter.dateTo) invoiceDate.lt = this.dateBound(filter.dateTo, true);
    if (invoiceDate.gte && invoiceDate.lt && invoiceDate.gte >= invoiceDate.lt)
      throw new BadRequestException('dateFrom must be on or before dateTo');
    const where: Prisma.SalesInvoiceWhereInput = {
      businessId,
      ...(filter.customerId && { customerId: filter.customerId }),
      ...(filter.locationId && { locationId: filter.locationId }),
      ...(filter.salespersonId && { salespersonId: filter.salespersonId }),
      ...(filter.search && {
        OR: [
          { invoiceNumber: { contains: filter.search, mode: 'insensitive' } },
          { customer: { name: { contains: filter.search, mode: 'insensitive' } } },
        ],
      }),
      ...(Object.keys(invoiceDate).length > 0 && { invoiceDate }),
      ...(filter.status === 'OVERDUE'
        ? {
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            dueDate: { lt: new Date() },
            balance: { gt: 0 },
          }
        : filter.status && { status: filter.status }),
    };
    const direction = filter.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Record<string, Prisma.SalesInvoiceOrderByWithRelationInput> = {
      invoiceNumber: { invoiceNumber: direction },
      totalAmount: { totalAmount: direction },
      invoiceDate: { invoiceDate: direction },
      dueDate: { dueDate: direction },
      createdAt: { createdAt: direction },
    };
    const [rows, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: orderBy[filter.sortBy || ''] || { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);
    return { data: rows.map((row) => this.mapInvoice(row)), total, page, limit };
  }

  async updateSalesInvoice(
    businessId: string,
    invoiceId: string,
    userId: string,
    dto: UpdateSalesInvoiceDto,
  ): Promise<SalesInvoiceResponseDto> {
    this.exclusiveDiscount(dto.discountAmount, dto.discountPercentage);
    await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, businessId, invoiceId);
      const before = await tx.salesInvoice.findFirst({
        where: { id: invoiceId, businessId },
        include: { items: true },
      });
      if (!before) throw new NotFoundException('Sales invoice not found');
      if (before.status !== 'DRAFT')
        throw new BadRequestException('Only DRAFT invoices can be updated');
      const customerId = dto.customerId || before.customerId;
      const locationId = dto.locationId || before.locationId;
      const customer = await tx.customer.findFirst({
        where: { id: customerId, businessId, isActive: true },
      });
      if (!customer) throw new NotFoundException('Active customer not found');
      if (!(await tx.location.findFirst({ where: { id: locationId, businessId, isActive: true } })))
        throw new NotFoundException('Active location not found');
      const terms = dto.paymentTerms || before.paymentTerms;
      if (!Object.prototype.hasOwnProperty.call(termsDays, terms))
        throw new BadRequestException('Invalid payment terms');
      const invoiceDate = dto.invoiceDate
        ? this.parseInvoiceDate(dto.invoiceDate)
        : before.invoiceDate;
      const dueDate = dto.dueDate
        ? this.parseInvoiceDate(dto.dueDate, true)
        : dto.invoiceDate || dto.paymentTerms
          ? this.dueDate(invoiceDate, terms)
          : before.dueDate;
      if (dueDate && dueDate < invoiceDate)
        throw new BadRequestException('Due date cannot be before invoice date');
      const salespersonId = dto.salespersonId || before.salespersonId || userId;
      const salesperson = await tx.user.findFirst({
        where: { id: salespersonId, businessId, isActive: true },
        select: { id: true },
      });
      if (!salesperson) throw new NotFoundException('Active salesperson not found');
      const lines = dto.items
        ? await this.prepareLines(businessId, dto.items)
        : before.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
            discountPercentage: i.discountPercentage,
            total: i.total,
            batchNumber: i.batchNumber,
            expiryDate: i.expiryDate,
            notes: i.notes,
          }));
      const subtotal = money(lines.reduce((sum, line) => sum + line.total, 0));
      const discount = this.discountFor(
        subtotal,
        dto.discountAmount !== undefined
          ? dto.discountAmount
          : dto.discountPercentage !== undefined
            ? undefined
            : before.discountAmount,
        dto.discountPercentage !== undefined
          ? dto.discountPercentage
          : dto.discountAmount !== undefined
            ? undefined
            : before.discountPercent,
      );
      const taxAmount = money(dto.taxAmount !== undefined ? dto.taxAmount : before.taxAmount);
      const totalAmount = money(subtotal - discount.amount + taxAmount);
      if (totalAmount < 0) throw new BadRequestException('Invoice total cannot be negative');
      if (!['COD', 'PREPAID'].includes(terms)) {
        await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "businessId" = ${businessId} FOR UPDATE`;
        const outstanding = await this.customerOutstanding(
          tx,
          businessId,
          customerId,
          customer.openingBalance,
        );
        if (outstanding + totalAmount > customer.creditLimit + 1e-8)
          throw new BadRequestException('Invoice would exceed the customer credit limit');
      }
      if (dto.items) {
        await tx.salesInvoiceItem.deleteMany({ where: { invoiceId } });
        await tx.salesInvoiceItem.createMany({
          data: lines.map((line, index) => ({
            id: uuid(),
            invoiceId,
            lineNo: index + 1,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            discountPercentage: line.discountPercentage,
            total: line.total,
            batchNumber: line.batchNumber,
            expiryDate: line.expiryDate,
            notes: line.notes,
          })),
        });
      }
      const updated = await tx.salesInvoice.update({
        where: { id: invoiceId },
        data: {
          customerId,
          locationId,
          invoiceDate,
          paymentTerms: terms,
          dueDate,
          salespersonId: salesperson.id,
          subtotal,
          discountAmount: discount.amount,
          discountPercent: discount.percentage,
          taxAmount,
          totalAmount,
          balance: totalAmount,
          ...(dto.referenceNumber !== undefined && { referenceNumber: dto.referenceNumber }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.attachments !== undefined && { attachments: JSON.stringify(dto.attachments) }),
        },
      });
      await this.audit(
        tx,
        businessId,
        userId,
        'SalesInvoice',
        invoiceId,
        'UPDATE',
        before,
        updated,
      );
    });
    return this.getSalesInvoiceById(businessId, invoiceId);
  }

  async issueSalesInvoice(
    businessId: string,
    invoiceId: string,
    userId: string,
  ): Promise<SalesInvoiceResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, businessId, invoiceId);
      const invoice = await tx.salesInvoice.findFirst({
        where: { id: invoiceId, businessId },
        include: { items: { include: { product: true } }, customer: true },
      });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.status !== 'DRAFT')
        throw new BadRequestException('Only DRAFT invoices can be issued');
      await assertAccountingPeriodOpen(tx, businessId, new Date());
      if (!invoice.items.length)
        throw new BadRequestException('Invoice must have at least one item');
      const customer = await tx.customer.findFirst({
        where: { id: invoice.customerId, businessId, isActive: true },
      });
      if (!customer) throw new BadRequestException('Customer is inactive or unavailable');
      if (!['COD', 'PREPAID'].includes(invoice.paymentTerms)) {
        await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customer.id} AND "businessId" = ${businessId} FOR UPDATE`;
        const outstanding = await this.customerOutstanding(
          tx,
          businessId,
          customer.id,
          customer.openingBalance,
          invoiceId,
        );
        if (outstanding + invoice.totalAmount > customer.creditLimit + 1e-8)
          throw new BadRequestException(
            'Issuing this invoice would exceed the customer credit limit',
          );
      }
      const business = await tx.business.findUnique({
        where: { id: businessId },
        select: { allowNegativeStock: true },
      });
      if (!business) throw new NotFoundException('Business not found');
      const quantities = this.aggregateQuantities(invoice.items);
      const unitCostByProduct = new Map<string, number>();
      for (const [productId, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
        await tx.stockBalance.upsert({
          where: { productId_locationId: { productId, locationId: invoice.locationId } },
          create: { id: uuid(), productId, locationId: invoice.locationId, quantity: 0 },
          update: {},
        });
        const locked = await tx.$queryRaw<
          Array<{ quantity: number }>
        >`SELECT "quantity" FROM "StockBalance" WHERE "productId" = ${productId} AND "locationId" = ${invoice.locationId} FOR UPDATE`;
        const available = Number(locked[0]?.quantity || 0);
        if (available < quantity && !business.allowNegativeStock)
          throw new BadRequestException(
            `Insufficient stock for ${invoice.items.find((item) => item.productId === productId)?.product.name || productId}; available: ${available}`,
          );
        const product = invoice.items.find((item) => item.productId === productId)?.product;
        unitCostByProduct.set(
          productId,
          await this.inventory.outgoingUnitCost(
            tx,
            businessId,
            productId,
            invoice.locationId,
            quantity,
            available,
            product?.buyingPrice || 0,
          ),
        );
        await tx.stockBalance.update({
          where: { productId_locationId: { productId, locationId: invoice.locationId } },
          data: { quantity: available - quantity, lastMovementAt: new Date() },
        });
      }
      for (const item of invoice.items)
        await tx.inventoryMovement.create({
          data: {
            id: uuid(),
            businessId,
            productId: item.productId,
            locationId: invoice.locationId,
            type: 'SALE',
            quantity: -item.quantity,
            referenceId: invoiceId,
            referenceType: 'SalesInvoice',
            notes: `Invoice ${invoice.invoiceNumber}`,
            unitCost: unitCostByProduct.get(item.productId),
            createdBy: userId,
          },
        });
      const now = new Date();
      const updated = await tx.salesInvoice.update({
        where: { id: invoiceId },
        data: { status: 'ISSUED', issuedDate: now, approvedBy: userId, approvedAt: now },
      });
      await this.audit(
        tx,
        businessId,
        userId,
        'SalesInvoice',
        invoiceId,
        'ISSUE',
        invoice,
        updated,
      );
    });
    const issued = await this.getSalesInvoiceById(businessId, invoiceId);
    await Promise.all(
      [...new Set(issued.items.map((item) => item.productId))].map((productId) =>
        this.notifications.checkStockLevel(businessId, productId, issued.locationId),
      ),
    );
    const contact = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, businessId },
      select: { customer: { select: { name: true, email: true } } },
    });
    await this.notifications.publishEvent({
      businessId,
      eventType: NotificationEventType.SALES_INVOICE_ISSUED,
      referenceId: invoiceId,
      referenceType: 'SalesInvoice',
      variables: {
        invoiceNumber: issued.invoiceNumber,
        customerName: issued.customerName,
        totalAmount: issued.totalAmount,
      },
      externalRecipients: contact?.customer.email
        ? [{ email: contact.customer.email, name: contact.customer.name }]
        : [],
    });
    return issued;
  }

  async applyDiscount(
    businessId: string,
    invoiceId: string,
    userId: string,
    dto: ApplyDiscountDto,
  ): Promise<SalesInvoiceResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, businessId, invoiceId);
      const invoice = await tx.salesInvoice.findFirst({ where: { id: invoiceId, businessId } });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.status !== 'DRAFT')
        throw new BadRequestException('Discounts can only be applied to DRAFT invoices');
      const user = await tx.user.findFirst({
        where: { id: userId, businessId },
        include: { userRoles: { include: { role: { select: { name: true, businessId: true } } } } },
      });
      if (!user) throw new NotFoundException('User not found');
      const roles = user.userRoles
        .filter((link) => link.role.businessId === businessId)
        .map((link) => link.role.name);
      const max = roles.some((role) => ['Owner', 'Admin'].includes(role))
        ? 100
        : roles.includes('Manager')
          ? 25
          : roles.includes('Salesperson')
            ? 10
            : 0;
      if (dto.percentage > max)
        throw new ForbiddenException(`Your role may apply discounts up to ${max}%`);
      const amount = money((invoice.subtotal * dto.percentage) / 100);
      const updated = await tx.salesInvoice.update({
        where: { id: invoiceId },
        data: {
          discountPercent: dto.percentage,
          discountAmount: amount,
          totalAmount: money(invoice.subtotal - amount + invoice.taxAmount),
          balance: money(invoice.subtotal - amount + invoice.taxAmount),
        },
      });
      await this.audit(
        tx,
        businessId,
        userId,
        'SalesInvoice',
        invoiceId,
        'APPLY_DISCOUNT',
        invoice,
        { ...updated, reason: dto.reason },
      );
    });
    return this.getSalesInvoiceById(businessId, invoiceId);
  }

  async createSalesPayment(
    businessId: string,
    invoiceId: string,
    userId: string,
    dto: SalesPaymentDto,
    idempotencyKey?: string,
  ): Promise<SalesPaymentResponseDto> {
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    if (!Number.isFinite(paymentDate.getTime()))
      throw new BadRequestException('Invalid paymentDate');
    let paymentId: string;
    try {
      paymentId = await this.prisma.$transaction(async (tx) => {
        await this.lockInvoice(tx, businessId, invoiceId);
        const invoice = await tx.salesInvoice.findFirst({ where: { id: invoiceId, businessId } });
        if (!invoice) throw new NotFoundException('Sales invoice not found');
        await assertAccountingPeriodOpen(tx, businessId, paymentDate);
        if (['DRAFT', 'CANCELLED'].includes(invoice.status))
          throw new BadRequestException('Payments require an issued invoice');
        if (
          !(await tx.paymentMethod.findFirst({
            where: { id: dto.paymentMethodId, businessId, isActive: true },
          }))
        )
          throw new BadRequestException('Active payment method not found');
        const idempotentPaymentNumber =
          !dto.paymentNumber && idempotencyKey
            ? `SP-IDEM-${createHash('sha256')
                .update(`${businessId}:${idempotencyKey}`)
                .digest('hex')
                .slice(0, 32)
                .toUpperCase()}`
            : undefined;
        if (idempotentPaymentNumber) {
          const existing = await tx.payment.findFirst({
            where: { businessId, paymentNumber: idempotentPaymentNumber },
          });
          if (existing) {
            const sameRequest =
              existing.invoiceId === invoiceId &&
              existing.amount === money(dto.amount) &&
              existing.paymentMethodId === dto.paymentMethodId &&
              (existing.reference || undefined) === dto.reference &&
              (existing.notes || undefined) === dto.notes &&
              (!dto.paymentDate || existing.paymentDate.getTime() === paymentDate.getTime());
            if (!sameRequest)
              throw new ConflictException('Idempotency key was already used for another payment');
            return existing.id;
          }
        }
        const state = await this.invoicePaymentState(tx, invoiceId, invoice.totalAmount);
        if (state.balance <= 0) throw new BadRequestException('Invoice has no amount due');
        const amount = money(dto.amount);
        if (amount > state.balance + 1e-8)
          throw new BadRequestException(`Payment exceeds balance due (${state.balance})`);
        const paymentNumber =
          dto.paymentNumber ||
          idempotentPaymentNumber ||
          `SP-${new Date().toISOString().slice(0, 7).replace('-', '')}-${uuid().slice(0, 8).toUpperCase()}`;
        const payment = await tx.payment.create({
          data: {
            id: uuid(),
            businessId,
            paymentNumber,
            paymentDate,
            customerId: invoice.customerId,
            invoiceId,
            amount,
            paymentMethodId: dto.paymentMethodId,
            reference: dto.reference,
            notes: dto.notes,
            status: 'RECORDED',
            createdBy: userId,
          },
        });
        const after = await this.invoicePaymentState(tx, invoiceId, invoice.totalAmount);
        await tx.salesInvoice.update({
          where: { id: invoiceId },
          data: {
            totalPaid: after.totalPaid,
            balance: after.balance,
            status: after.balance <= 0 ? 'PAID' : 'PARTIALLY_PAID',
          },
        });
        await this.audit(tx, businessId, userId, 'SalesInvoice', invoiceId, 'PAYMENT', invoice, {
          paymentId: payment.id,
          amount,
          balance: after.balance,
        });
        return payment.id;
      });
    } catch (error) {
      if (this.uniqueViolation(error)) throw new ConflictException('Payment number already exists');
      throw error;
    }
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, businessId } });
    if (!payment) throw new NotFoundException('Payment not found after creation');
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, businessId },
      include: { customer: { select: { name: true, email: true } } },
    });
    await this.notifications.publishEvent({
      businessId,
      eventType: NotificationEventType.PAYMENT_RECEIVED,
      referenceId: payment.id,
      referenceType: 'Payment',
      idempotencyKey: `PAYMENT_RECEIVED:${payment.id}`,
      variables: {
        paymentNumber: payment.paymentNumber,
        amount: payment.amount,
        invoiceNumber: invoice?.invoiceNumber,
      },
      externalRecipients: invoice?.customer.email
        ? [{ email: invoice.customer.email, name: invoice.customer.name }]
        : [],
    });
    return {
      id: payment.id,
      businessId,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      customerId: payment.customerId || '',
      salesInvoiceId: invoiceId,
      amount: payment.amount,
      paymentMethodId: payment.paymentMethodId,
      reference: payment.reference || undefined,
      notes: payment.notes || undefined,
      status: payment.status,
      createdAt: payment.createdAt,
    };
  }

  async cancelSalesInvoice(
    businessId: string,
    invoiceId: string,
    userId: string,
    dto: SalesCancelDto,
  ): Promise<SalesInvoiceResponseDto> {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Cancellation reason is required');
    await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, businessId, invoiceId);
      const invoice = await tx.salesInvoice.findFirst({
        where: { id: invoiceId, businessId },
        include: { items: { include: { product: true } } },
      });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.status === 'CANCELLED')
        throw new BadRequestException('Invoice is already cancelled');
      if (invoice.status !== 'DRAFT') {
        const paymentState = await this.invoicePaymentState(tx, invoiceId, invoice.totalAmount);
        if (paymentState.totalPaid > 0)
          throw new BadRequestException('Reverse/refund invoice payments before cancellation');
        const returns = await tx.salesReturn.count({
          where: { invoiceId, status: { in: ['DRAFT', 'AUTHORIZED', 'RECEIVED', 'COMPLETED'] } },
        });
        if (returns)
          throw new BadRequestException('Resolve sales returns before cancelling the invoice');
        const originalSaleMovements = await tx.inventoryMovement.findMany({
          where: {
            businessId,
            referenceType: 'SalesInvoice',
            referenceId: invoiceId,
            type: 'SALE',
          },
          select: { productId: true, unitCost: true },
        });
        const unitCostByProduct = new Map(
          originalSaleMovements.map((movement) => [movement.productId, movement.unitCost]),
        );
        for (const item of invoice.items) {
          const stock = await tx.stockBalance.upsert({
            where: {
              productId_locationId: { productId: item.productId, locationId: invoice.locationId },
            },
            create: {
              id: uuid(),
              productId: item.productId,
              locationId: invoice.locationId,
              quantity: 0,
            },
            update: {},
          });
          const locked = await tx.$queryRaw<
            Array<{ quantity: number }>
          >`SELECT "quantity" FROM "StockBalance" WHERE "id" = ${stock.id} FOR UPDATE`;
          await tx.stockBalance.update({
            where: { id: stock.id },
            data: {
              quantity: Number(locked[0].quantity) + item.quantity,
              lastMovementAt: new Date(),
            },
          });
          await tx.inventoryMovement.create({
            data: {
              id: uuid(),
              businessId,
              productId: item.productId,
              locationId: invoice.locationId,
              type: 'SALE_REVERSAL',
              quantity: item.quantity,
              referenceId: invoiceId,
              referenceType: 'SalesInvoice',
              notes: `${invoice.invoiceNumber}: ${reason}`,
              unitCost: unitCostByProduct.get(item.productId) ?? item.product.buyingPrice,
              createdBy: userId,
            },
          });
        }
      }
      const updated = await tx.salesInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'CANCELLED',
          cancelledBy: userId,
          cancelledAt: new Date(),
          notes: [invoice.notes, `[CANCELLED: ${reason}]`].filter(Boolean).join('\n'),
        },
      });
      await this.audit(tx, businessId, userId, 'SalesInvoice', invoiceId, 'CANCEL', invoice, {
        ...updated,
        reason,
      });
    });
    return this.getSalesInvoiceById(businessId, invoiceId);
  }

  async createSalesReturn(
    businessId: string,
    userId: string,
    dto: CreateSalesReturnDto,
  ): Promise<SalesReturnResponseDto> {
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.lockInvoice(tx, businessId, dto.salesInvoiceId);
        const invoice = await tx.salesInvoice.findFirst({
          where: { id: dto.salesInvoiceId, businessId },
          include: { items: { include: { product: true } } },
        });
        if (!invoice) throw new NotFoundException('Sales invoice not found');
        if (['DRAFT', 'CANCELLED'].includes(invoice.status))
          throw new BadRequestException('Returns require an issued invoice');
        const requestedIds = [...new Set(dto.items.map((item) => item.salesInvoiceItemId))];
        const invoiceItems = invoice.items.filter((item) => requestedIds.includes(item.id));
        if (invoiceItems.length !== requestedIds.length)
          throw new BadRequestException('Return lines must belong to the selected invoice');
        const previous = await tx.salesReturnItem.findMany({
          where: {
            salesInvoiceItemId: { in: requestedIds },
            return: {
              businessId,
              status: { in: ['DRAFT', 'AUTHORIZED', 'RECEIVED', 'COMPLETED'] },
            },
          },
        });
        const returned = new Map<string, number>();
        for (const line of previous)
          if (line.salesInvoiceItemId)
            returned.set(
              line.salesInvoiceItemId,
              (returned.get(line.salesInvoiceItemId) || 0) + line.quantity,
            );
        const requested = new Map<string, number>();
        for (const line of dto.items)
          requested.set(
            line.salesInvoiceItemId,
            (requested.get(line.salesInvoiceItemId) || 0) + line.quantity,
          );
        for (const [itemId, quantity] of requested) {
          const original = invoiceItems.find((line) => line.id === itemId)!;
          if ((returned.get(itemId) || 0) + quantity > original.quantity + 1e-8)
            throw new BadRequestException(
              `Return quantity exceeds sold quantity for ${original.product.name}`,
            );
        }
        if (dto.authorizeNow) await this.assertPermission(tx, businessId, userId, 'sales.approve');
        const returnNumber = dto.returnNumber || (await this.nextReturnNumber(tx, businessId));
        const factor =
          invoice.subtotal > 0
            ? Math.max(0, (invoice.subtotal - invoice.discountAmount) / invoice.subtotal)
            : 1;
        const lines = dto.items.map((line) => {
          const source = invoiceItems.find(
            (candidate) => candidate.id === line.salesInvoiceItemId,
          )!;
          const unitPrice =
            source.quantity > 0 ? money((source.total / source.quantity) * factor) : 0;
          return {
            id: uuid(),
            returnId: '',
            productId: source.productId,
            salesInvoiceItemId: source.id,
            quantity: line.quantity,
            unitPrice,
            total: money(line.quantity * unitPrice),
            reason: line.reason,
            notes: line.notes,
          };
        });
        const now = new Date();
        const created = await tx.salesReturn.create({
          data: {
            id: uuid(),
            businessId,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            returnNumber,
            returnDate: now,
            reason: [...new Set(dto.items.map((line) => line.reason))].join(','),
            totalAmount: money(lines.reduce((sum, line) => sum + line.total, 0)),
            status: dto.authorizeNow ? 'AUTHORIZED' : 'DRAFT',
            createdBy: userId,
            notes: dto.notes,
            ...(dto.authorizeNow && { authorizedBy: userId, authorizedAt: now }),
          },
        });
        await tx.salesReturnItem.createMany({
          data: lines.map((line) => ({
            id: line.id,
            productId: line.productId,
            salesInvoiceItemId: line.salesInvoiceItemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.total,
            reason: line.reason,
            notes: line.notes,
            returnId: created.id,
          })),
        });
        await this.audit(tx, businessId, userId, 'SalesReturn', created.id, 'CREATE', null, {
          returnNumber,
          invoiceId: invoice.id,
          amount: created.totalAmount,
        });
        if (dto.authorizeNow)
          await this.audit(tx, businessId, userId, 'SalesReturn', created.id, 'AUTHORIZE', null, {
            authorizedBy: userId,
          });
        return created.id;
      });
    } catch (error) {
      if (this.uniqueViolation(error))
        throw new ConflictException('Sales return number already exists');
      throw error;
    }
    return this.getSalesReturnById(businessId, id);
  }

  async getSalesReturnById(businessId: string, returnId: string): Promise<SalesReturnResponseDto> {
    const ret = await this.prisma.salesReturn.findFirst({
      where: { id: returnId, businessId },
      include: { invoice: { include: { customer: true } }, items: { include: { product: true } } },
    });
    if (!ret) throw new NotFoundException('Sales return not found');
    return this.mapReturn(ret);
  }

  async getAllSalesReturns(businessId: string, filter: SalesReturnFilterDto) {
    const page = Math.max(1, Math.floor(Number(filter.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(filter.limit) || 20)));
    const where: Prisma.SalesReturnWhereInput = {
      businessId,
      ...(filter.salesInvoiceId && { invoiceId: filter.salesInvoiceId }),
      ...(filter.status && { status: filter.status }),
      ...(filter.search && {
        OR: [
          { returnNumber: { contains: filter.search, mode: 'insensitive' } },
          { invoice: { invoiceNumber: { contains: filter.search, mode: 'insensitive' } } },
          { invoice: { customer: { name: { contains: filter.search, mode: 'insensitive' } } } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.salesReturn.findMany({
        where,
        include: {
          invoice: { include: { customer: true } },
          items: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.salesReturn.count({ where }),
    ]);
    return { data: rows.map((row) => this.mapReturn(row)), total, page, limit };
  }

  async authorizeSalesReturn(
    businessId: string,
    returnId: string,
    userId: string,
  ): Promise<SalesReturnResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const key = await tx.salesReturn.findFirst({
        where: { id: returnId, businessId },
        select: { invoiceId: true },
      });
      if (!key) throw new NotFoundException('Sales return not found');
      await this.lockInvoice(tx, businessId, key.invoiceId);
      await this.lockReturn(tx, businessId, returnId);
      const ret = await tx.salesReturn.findFirst({ where: { id: returnId, businessId } });
      if (!ret) throw new NotFoundException('Sales return not found');
      if (ret.status !== 'DRAFT')
        throw new BadRequestException('Only DRAFT returns can be authorized');
      const updated = await tx.salesReturn.update({
        where: { id: returnId },
        data: { status: 'AUTHORIZED', authorizedBy: userId, authorizedAt: new Date() },
      });
      await this.audit(tx, businessId, userId, 'SalesReturn', returnId, 'AUTHORIZE', ret, updated);
    });
    return this.getSalesReturnById(businessId, returnId);
  }

  async receiveSalesReturn(
    businessId: string,
    returnId: string,
    userId: string,
  ): Promise<SalesReturnResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const key = await tx.salesReturn.findFirst({
        where: { id: returnId, businessId },
        select: { invoiceId: true },
      });
      if (!key) throw new NotFoundException('Sales return not found');
      await this.lockInvoice(tx, businessId, key.invoiceId);
      await this.lockReturn(tx, businessId, returnId);
      const ret = await tx.salesReturn.findFirst({
        where: { id: returnId, businessId },
        include: { invoice: true, items: true },
      });
      if (!ret) throw new NotFoundException('Sales return not found');
      if (ret.status !== 'AUTHORIZED')
        throw new BadRequestException('Only AUTHORIZED returns can be received');
      if (ret.invoice.status === 'CANCELLED')
        throw new BadRequestException('Cannot receive a return for a cancelled invoice');
      const originalSaleMovements = await tx.inventoryMovement.findMany({
        where: {
          businessId,
          referenceType: 'SalesInvoice',
          referenceId: ret.invoiceId,
          type: 'SALE',
        },
        select: { productId: true, unitCost: true },
      });
      const products = await tx.product.findMany({
        where: { businessId, id: { in: ret.items.map((item) => item.productId) } },
        select: { id: true, buyingPrice: true },
      });
      const fallbackCostByProduct = new Map(
        products.map((product) => [product.id, product.buyingPrice]),
      );
      const unitCostByProduct = new Map(
        originalSaleMovements.map((movement) => [movement.productId, movement.unitCost]),
      );
      for (const item of [...ret.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const stock = await tx.stockBalance.upsert({
          where: {
            productId_locationId: { productId: item.productId, locationId: ret.invoice.locationId },
          },
          create: {
            id: uuid(),
            productId: item.productId,
            locationId: ret.invoice.locationId,
            quantity: 0,
          },
          update: {},
        });
        const locked = await tx.$queryRaw<
          Array<{ quantity: number }>
        >`SELECT "quantity" FROM "StockBalance" WHERE "id" = ${stock.id} FOR UPDATE`;
        await tx.stockBalance.update({
          where: { id: stock.id },
          data: {
            quantity: Number(locked[0].quantity) + item.quantity,
            lastMovementAt: new Date(),
          },
        });
        await tx.inventoryMovement.create({
          data: {
            id: uuid(),
            businessId,
            productId: item.productId,
            locationId: ret.invoice.locationId,
            type: 'CUSTOMER_RETURN',
            quantity: item.quantity,
            referenceId: ret.id,
            referenceType: 'SalesReturn',
            notes: `${ret.returnNumber}: ${item.reason || ret.reason}`,
            unitCost:
              unitCostByProduct.get(item.productId) ??
              fallbackCostByProduct.get(item.productId) ??
              0,
            createdBy: userId,
          },
        });
      }
      const updated = await tx.salesReturn.update({
        where: { id: returnId },
        data: { status: 'RECEIVED', receivedBy: userId, receivedAt: new Date() },
      });
      await this.refreshPaymentState(tx, ret.invoiceId, ret.invoice.totalAmount);
      await this.audit(tx, businessId, userId, 'SalesReturn', returnId, 'RECEIVE', ret, updated);
    });
    return this.getSalesReturnById(businessId, returnId);
  }

  async rejectSalesReturn(
    businessId: string,
    returnId: string,
    userId: string,
    dto: SalesRejectDto,
  ): Promise<SalesReturnResponseDto> {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Rejection reason is required');
    await this.prisma.$transaction(async (tx) => {
      const key = await tx.salesReturn.findFirst({
        where: { id: returnId, businessId },
        select: { invoiceId: true },
      });
      if (!key) throw new NotFoundException('Sales return not found');
      await this.lockInvoice(tx, businessId, key.invoiceId);
      await this.lockReturn(tx, businessId, returnId);
      const ret = await tx.salesReturn.findFirst({ where: { id: returnId, businessId } });
      if (!ret) throw new NotFoundException('Sales return not found');
      if (!['DRAFT', 'AUTHORIZED'].includes(ret.status))
        throw new BadRequestException('Only DRAFT or AUTHORIZED returns can be rejected');
      const updated = await tx.salesReturn.update({
        where: { id: returnId },
        data: {
          status: 'REJECTED',
          rejectedBy: userId,
          rejectedAt: new Date(),
          notes: [ret.notes, `[REJECTED: ${reason}]`].filter(Boolean).join('\n'),
        },
      });
      await this.audit(tx, businessId, userId, 'SalesReturn', returnId, 'REJECT', ret, {
        ...updated,
        reason,
      });
    });
    return this.getSalesReturnById(businessId, returnId);
  }

  private mapInvoice(invoice: InvoiceDetails): SalesInvoiceResponseDto {
    const totalPaid = money(
      invoice.payments
        .filter((p) => ['RECORDED', 'VERIFIED'].includes(p.status))
        .reduce((sum, p) => sum + p.amount, 0),
    );
    const returned = money(
      invoice.returns
        .filter((r) => ['RECEIVED', 'COMPLETED'].includes(r.status))
        .reduce((sum, r) => sum + r.totalAmount, 0),
    );
    const balance = money(invoice.totalAmount - totalPaid - returned);
    let status = invoice.status;
    if (!['DRAFT', 'CANCELLED'].includes(status)) {
      status = balance <= 0 ? 'PAID' : totalPaid > 0 || returned > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
      if (balance > 0 && invoice.dueDate && invoice.dueDate < new Date()) status = 'OVERDUE';
    }
    return {
      id: invoice.id,
      businessId: invoice.businessId,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customer.name,
      customerCode: invoice.customer.customerCode,
      customerType: invoice.customer.customerType,
      locationId: invoice.locationId,
      locationName: invoice.location.name,
      invoiceDate: invoice.invoiceDate,
      salespersonId: invoice.salespersonId || undefined,
      status,
      items: invoice.items.map((i) => ({
        id: i.id,
        salesInvoiceId: i.invoiceId,
        productId: i.productId,
        productName: i.product.name,
        productSku: i.product.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: money(i.quantity * i.unitPrice),
        discountPercentage: i.discountPercentage,
        discountAmount: i.discount,
        lineTotal: i.total,
        batchNumber: i.batchNumber || undefined,
        expiryDate: i.expiryDate || undefined,
        notes: i.notes || undefined,
      })),
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      discountPercentage: invoice.discountPercent,
      taxableAmount: money(invoice.subtotal - invoice.discountAmount),
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      totalPaid,
      balance,
      paymentTerms: invoice.paymentTerms,
      attachments: this.parseAttachments(invoice.attachments),
      referenceNumber: invoice.referenceNumber || undefined,
      issuedDate: invoice.issuedDate || undefined,
      dueDate: invoice.dueDate || undefined,
      approvedBy: invoice.approvedBy || undefined,
      approvedAt: invoice.approvedAt || undefined,
      cancelledBy: invoice.cancelledBy || undefined,
      cancelledAt: invoice.cancelledAt || undefined,
      notes: invoice.notes || undefined,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }

  private mapReturn(ret: any): SalesReturnResponseDto {
    return {
      id: ret.id,
      businessId: ret.businessId,
      returnNumber: ret.returnNumber,
      salesInvoiceId: ret.invoiceId,
      invoiceNumber: ret.invoice.invoiceNumber,
      customerId: ret.customerId || ret.invoice.customerId,
      customerName: ret.invoice.customer.name,
      status: ret.status,
      items: ret.items.map((i: any) => ({
        id: i.id,
        salesReturnId: i.returnId,
        salesInvoiceItemId: i.salesInvoiceItemId || '',
        productName: i.product.name,
        productSku: i.product.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.total,
        reason: i.reason || ret.reason,
        notes: i.notes || undefined,
      })),
      totalReturnAmount: ret.totalAmount,
      authorizedBy: ret.authorizedBy || undefined,
      authorizedAt: ret.authorizedAt || undefined,
      rejectedBy: ret.rejectedBy || undefined,
      rejectedAt: ret.rejectedAt || undefined,
      receivedBy: ret.receivedBy || undefined,
      receivedAt: ret.receivedAt || undefined,
      notes: ret.notes || undefined,
      createdAt: ret.createdAt,
      updatedAt: ret.updatedAt,
    };
  }

  private async prepareLines(businessId: string, items: CreateSalesInvoiceDto['items']) {
    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        id: { in: [...new Set(items.map((item) => item.productId))] },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    const known = new Set(products.map((product) => product.id));
    const unknown = items.find((item) => !known.has(item.productId));
    if (unknown)
      throw new NotFoundException(`Active product ${unknown.productId} not found in this business`);
    return items.map((item) => {
      this.exclusiveDiscount(item.discountAmount, item.discountPercentage);
      const gross = money(item.quantity * item.unitPrice);
      const discount =
        item.discountAmount !== undefined
          ? money(item.discountAmount)
          : money((gross * (item.discountPercentage || 0)) / 100);
      if (discount > gross + 1e-8)
        throw new BadRequestException('Line discount cannot exceed line subtotal');
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount,
        discountPercentage: item.discountPercentage || 0,
        total: money(gross - discount),
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        notes: item.notes,
      };
    });
  }

  private discountFor(subtotal: number, amount?: number, percentage?: number) {
    const discountAmount =
      amount !== undefined ? money(amount) : money((subtotal * (percentage || 0)) / 100);
    if (discountAmount > subtotal + 1e-8)
      throw new BadRequestException('Invoice discount cannot exceed subtotal');
    return { amount: discountAmount, percentage: amount === undefined ? percentage || 0 : 0 };
  }

  private exclusiveDiscount(amount?: number, percentage?: number): void {
    if (amount !== undefined && percentage !== undefined)
      throw new BadRequestException('Set either discountAmount or discountPercentage, not both');
  }

  private dueDate(date: Date, terms: string): Date {
    const due = new Date(date);
    due.setUTCDate(due.getUTCDate() + (termsDays[terms] ?? 0));
    due.setUTCHours(23, 59, 59, 999);
    return due;
  }

  private parseInvoiceDate(value: string, endOfDay = false): Date {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = isDateOnly ? this.dateBound(value, false) : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Invalid invoice date');
    if (endOfDay && isDateOnly) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private parseAttachments(value: string | null): string[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
    } catch {
      // Preserve attachment values created before this field used JSON arrays.
    }
    return [value];
  }

  private dateBound(value: string, exclusiveEnd: boolean): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new BadRequestException('Dates must use YYYY-MM-DD');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw new BadRequestException('Invalid calendar date');
    if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  private aggregateQuantities(
    items: Array<{ productId: string; quantity: number }>,
  ): Map<string, number> {
    const totals = new Map<string, number>();
    for (const item of items)
      totals.set(item.productId, (totals.get(item.productId) || 0) + item.quantity);
    return totals;
  }

  private async lockInvoice(
    tx: Prisma.TransactionClient,
    businessId: string,
    invoiceId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "SalesInvoice" WHERE "id" = ${invoiceId} AND "businessId" = ${businessId} FOR UPDATE`;
  }

  private async lockReturn(
    tx: Prisma.TransactionClient,
    businessId: string,
    returnId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "SalesReturn" WHERE "id" = ${returnId} AND "businessId" = ${businessId} FOR UPDATE`;
  }

  private async lockSequence(
    tx: Prisma.TransactionClient,
    entity: string,
    businessId: string,
  ): Promise<void> {
    const key = `${entity}:${businessId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS acquired`;
  }

  private async nextInvoiceNumber(
    tx: Prisma.TransactionClient,
    businessId: string,
  ): Promise<string> {
    await this.lockSequence(tx, 'SalesInvoice', businessId);
    return this.nextMonthlyNumber(
      await tx.salesInvoice.findMany({
        where: { businessId },
        select: { invoiceNumber: true },
      }),
      'invoiceNumber',
      'INV',
    );
  }

  private async nextReturnNumber(
    tx: Prisma.TransactionClient,
    businessId: string,
  ): Promise<string> {
    await this.lockSequence(tx, 'SalesReturn', businessId);
    return this.nextMonthlyNumber(
      await tx.salesReturn.findMany({
        where: { businessId },
        select: { returnNumber: true },
      }),
      'returnNumber',
      'SR',
    );
  }

  private nextMonthlyNumber(
    rows: Array<Record<string, string>>,
    key: string,
    prefixName: string,
  ): string {
    const prefix = `${prefixName}-${new Date().toISOString().slice(0, 7).replace('-', '')}-`;
    const max = rows.reduce((highest, row) => {
      const value = row[key] || '';
      return value.startsWith(prefix)
        ? Math.max(highest, Number(value.slice(prefix.length)) || 0)
        : highest;
    }, 0);
    return `${prefix}${String(max + 1).padStart(5, '0')}`;
  }

  private async customerOutstanding(
    tx: Prisma.TransactionClient,
    businessId: string,
    customerId: string,
    openingBalance: number,
    excludeInvoiceId?: string,
  ): Promise<number> {
    const invoices = await tx.salesInvoice.findMany({
      where: {
        businessId,
        customerId,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        ...(excludeInvoiceId && { id: { not: excludeInvoiceId } }),
      },
      select: { balance: true },
    });
    return money(openingBalance + invoices.reduce((sum, invoice) => sum + invoice.balance, 0));
  }

  private async invoicePaymentState(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    total: number,
  ) {
    const [payments, returns] = await Promise.all([
      tx.payment.findMany({
        where: { invoiceId, status: { in: ['RECORDED', 'VERIFIED', 'RECONCILED', 'COMPLETED'] } },
        select: { amount: true },
      }),
      tx.salesReturn.findMany({
        where: { invoiceId, status: { in: ['RECEIVED', 'COMPLETED'] } },
        select: { totalAmount: true },
      }),
    ]);
    const totalPaid = money(payments.reduce((sum, payment) => sum + payment.amount, 0));
    const credit = money(returns.reduce((sum, ret) => sum + ret.totalAmount, 0));
    return { totalPaid, balance: money(total - totalPaid - credit) };
  }

  private async refreshPaymentState(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    total: number,
  ): Promise<void> {
    const state = await this.invoicePaymentState(tx, invoiceId, total);
    const invoice = await tx.salesInvoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    if (!invoice || ['DRAFT', 'CANCELLED'].includes(invoice.status)) return;
    const status =
      state.balance <= 0
        ? 'PAID'
        : state.totalPaid > 0 || state.balance < total
          ? 'PARTIALLY_PAID'
          : 'ISSUED';
    await tx.salesInvoice.update({
      where: { id: invoiceId },
      data: { totalPaid: state.totalPaid, balance: state.balance, status },
    });
  }

  private async assertPermission(
    tx: Prisma.TransactionClient,
    businessId: string,
    userId: string,
    key: string,
  ): Promise<void> {
    const user = await tx.user.findFirst({
      where: { id: userId, businessId },
      include: {
        permissions: { select: { key: true } },
        userRoles: { include: { role: { include: { permissions: { select: { key: true } } } } } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const keys = [
      ...user.permissions.map((permission) => permission.key),
      ...user.userRoles.flatMap((link) =>
        link.role.businessId === businessId
          ? link.role.permissions.map((permission) => permission.key)
          : [],
      ),
    ];
    if (!keys.includes(key)) throw new ForbiddenException(`Missing required permission: ${key}`);
  }

  private async audit(
    tx: Prisma.TransactionClient,
    businessId: string,
    userId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        id: uuid(),
        businessId,
        userId,
        entityType,
        entityId,
        action,
        beforeData: before == null ? null : JSON.stringify(before),
        afterData: after == null ? null : JSON.stringify(after),
        ipAddress: 'unknown',
      },
    });
  }

  private uniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
