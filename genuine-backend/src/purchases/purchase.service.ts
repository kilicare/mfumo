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
import { assertAccountingPeriodOpen } from '../common/utils/accounting-period.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CreateGRNDto,
  UpdateGRNDto,
  CreatePurchaseReturnDto,
  CreatePurchasePaymentDto,
  PurchaseOrderResponseDto,
  GRNResponseDto,
  PurchaseReturnResponseDto,
  PurchasePaymentResponseDto,
  PurchaseOrderFilterDto,
} from './dto';

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class PurchaseService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
    private readonly notifications: NotificationsService,
  ) {}

  // ============================================================
  // PURCHASE ORDERS
  // ============================================================

  /**
   * CREATE PURCHASE ORDER
   */
  async createPurchaseOrder(
    businessId: string,
    userId: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`[PURCHASES] Creating purchase order for supplier: ${dto.supplierId}`);

    // 1. Verify supplier exists
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: dto.supplierId,
        businessId,
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    // 2. Verify location exists
    const location = await this.prisma.location.findFirst({
      where: {
        id: dto.locationId,
        businessId,
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    // 3. Verify products exist
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: dto.items.map((item) => item.productId) },
        businessId,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of dto.items) {
      if (!productMap.has(item.productId)) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
    }

    // Calculate totals
    let subtotal = 0;
    const poItems = [];

    for (const item of dto.items) {
      const lineTotal = roundMoney(
        Number(item.quantity) * Number(item.unitPrice) - Number(item.discount || 0),
      );
      if (!Number.isFinite(lineTotal) || lineTotal < 0) {
        throw new BadRequestException('Item discount cannot exceed its gross amount');
      }
      subtotal = roundMoney(subtotal + lineTotal);
      poItems.push({
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount || 0),
        lineTotal,
        notes: item.notes,
      });
    }

    const shippingCost = roundMoney(Number(dto.shippingCost || 0));
    const taxAmount =
      dto.taxAmount !== undefined
        ? roundMoney(Number(dto.taxAmount))
        : roundMoney(subtotal * (Number(dto.taxPercentage || 0) / 100));
    const totalAmount = roundMoney(subtotal + shippingCost + taxAmount);

    // Create PO and its lines as one operation so failed line creation cannot
    // leave a header with a misleading total.
    let purchaseOrder: Prisma.PurchaseOrderGetPayload<object>;
    let poNumber: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        poNumber = dto.poNumber;
        if (!poNumber) {
          await this._lockNumberSequence(tx, businessId, 'PurchaseOrder');
          poNumber = await this._generatePONumber(businessId, tx);
        }
        const existingPO = await tx.purchaseOrder.findFirst({
          where: { businessId, poNumber },
          select: { id: true },
        });
        if (existingPO) throw new ConflictException(`PO number ${poNumber} already exists`);

        const created = await tx.purchaseOrder.create({
          data: {
            id: uuid(),
            businessId,
            poNumber,
            supplierId: dto.supplierId,
            locationId: dto.locationId,
            status: 'DRAFT',
            orderDate: dto.orderDate ? new Date(dto.orderDate) : new Date(),
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : null,
            subtotal,
            shippingCost,
            taxAmount,
            totalAmount,
            notes: dto.notes,
            referenceNumber: dto.referenceNumber,
            createdBy: userId,
          },
        });

        await tx.purchaseOrderItem.createMany({
          data: poItems.map((item) => ({ id: uuid(), purchaseOrderId: created.id, ...item })),
        });
        return { purchaseOrder: created, poNumber };
      });
      purchaseOrder = result.purchaseOrder;
      poNumber = result.poNumber;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = dto.poNumber
          ? await this.prisma.purchaseOrder.findFirst({
              where: { businessId, poNumber: dto.poNumber },
              select: { id: true },
            })
          : null;
        if (duplicate) throw new ConflictException(`PO number ${dto.poNumber} already exists`);
      }
      throw error;
    }

    // Create audit log
    await this._createAuditLog(businessId, userId, 'PurchaseOrder', purchaseOrder.id, 'CREATE', {
      action: 'Purchase Order created',
      poNumber,
      supplierId: dto.supplierId,
    });

    this.logger.log(`[PURCHASES] PO created: ${purchaseOrder.id} (${poNumber})`);

    return this.getPurchaseOrderById(businessId, purchaseOrder.id);
  }

  /**
   * GET PURCHASE ORDER BY ID
   */
  async getPurchaseOrderById(businessId: string, poId: string): Promise<PurchaseOrderResponseDto> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: poId,
        businessId,
      },
      include: {
        supplier: true,
        location: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    // Get GRN totals
    const grnItems = await this.prisma.gRNItem.findMany({
      where: {
        grn: {
          purchaseOrderId: poId,
          status: 'ACCEPTED',
        },
      },
    });

    const grnsMap = new Map<string, { received: number; accepted: number; rejected: number }>();
    grnItems.forEach((item) => {
      if (!grnsMap.has(item.purchaseOrderItemId)) {
        grnsMap.set(item.purchaseOrderItemId, {
          received: 0,
          accepted: 0,
          rejected: 0,
        });
      }
      const current = grnsMap.get(item.purchaseOrderItemId);
      current.received += item.receivedQuantity;
      current.accepted += item.acceptedQuantity;
      current.rejected += item.rejectedQuantity;
    });

    // Get Return items totals
    const returnItems = await this.prisma.purchaseReturnItem.findMany({
      where: {
        purchaseReturn: {
          purchaseOrderId: poId,
          status: 'APPROVED',
        },
      },
    });

    const returnsMap = new Map<string, number>();
    returnItems.forEach((ri) => {
      const current = returnsMap.get(ri.purchaseOrderItemId) || 0;
      returnsMap.set(ri.purchaseOrderItemId, current + ri.quantity);
    });

    // Get payment totals
    const payments = await this.prisma.payment.findMany({
      where: {
        poId: poId,
        businessId,
        status: { not: 'VOIDED' },
      },
    });

    const totalPaid = roundMoney(payments.reduce((sum, p) => sum + p.amount, 0));

    return {
      id: po.id,
      businessId: po.businessId,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      supplierCode: po.supplier.supplierCode,
      locationId: po.locationId,
      locationName: po.location.name,
      status: po.status,
      items: po.items.map((item) => {
        const grnData = grnsMap.get(item.id) || { received: 0, accepted: 0, rejected: 0 };
        const returnedQty = returnsMap.get(item.id) || 0;
        return {
          id: item.id,
          purchaseOrderId: item.purchaseOrderId,
          productId: item.productId,
          productName: item.product.name,
          productSku: item.product.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          lineTotal: item.lineTotal,
          grnReceivedQty: grnData.received,
          returnedQty,
          outstandingQty: Math.max(0, item.quantity - grnData.accepted + returnedQty),
          notes: item.notes,
        };
      }),
      subtotal: po.subtotal,
      shippingCost: po.shippingCost,
      taxAmount: po.taxAmount,
      totalAmount: po.totalAmount,
      totalReceived: grnItems.reduce((sum, item) => sum + item.acceptedQuantity, 0),
      totalPaid,
      balanceDue: roundMoney(po.totalAmount - totalPaid),
      orderDate: po.orderDate,
      expectedDeliveryDate: po.expectedDeliveryDate,
      approvedBy: po.approvedBy,
      approvedAt: po.approvedAt,
      cancelledBy: po.cancelledBy,
      cancelledAt: po.cancelledAt,
      notes: po.notes,
      referenceNumber: po.referenceNumber,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    };
  }

  async createPurchasePayment(
    businessId: string,
    poId: string,
    userId: string,
    dto: CreatePurchasePaymentDto,
  ): Promise<PurchasePaymentResponseDto> {
    const paymentNumber =
      dto.paymentNumber ||
      `PAY-${new Date().toISOString().slice(0, 7).replace('-', '')}-${uuid().slice(0, 8).toUpperCase()}`;
    const duplicate = await this.prisma.payment.findFirst({
      where: { paymentNumber },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException(`Payment number ${paymentNumber} already exists`);

    let payment;
    try {
      payment = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${poId} AND "businessId" = ${businessId} FOR UPDATE`;
          const po = await tx.purchaseOrder.findFirst({ where: { id: poId, businessId } });
          if (!po) throw new NotFoundException('Purchase order not found');
          await assertAccountingPeriodOpen(tx, businessId, dto.paymentDate || new Date());
          if (po.status === 'CANCELLED') {
            throw new BadRequestException(
              'Payments cannot be recorded for a cancelled purchase order',
            );
          }
          const paymentMethod = await tx.paymentMethod.findFirst({
            where: { id: dto.paymentMethodId, businessId, isActive: true },
            select: { id: true },
          });
          if (!paymentMethod) throw new BadRequestException('Active payment method not found');

          const prior = await tx.payment.aggregate({
            where: { businessId, poId, status: { not: 'VOIDED' } },
            _sum: { amount: true },
          });
          const totalPaid = prior._sum.amount || 0;
          const amount = Math.round((Number(dto.amount) + Number.EPSILON) * 100) / 100;
          const balanceDue = Math.round((po.totalAmount - totalPaid + Number.EPSILON) * 100) / 100;
          if (amount > balanceDue) {
            throw new BadRequestException(
              `Payment exceeds the purchase order balance of ${balanceDue}`,
            );
          }

          return tx.payment.create({
            data: {
              id: uuid(),
              businessId,
              paymentNumber,
              paymentDate: dto.paymentDate || new Date(),
              supplierId: po.supplierId,
              poId,
              amount,
              paymentMethodId: paymentMethod.id,
              reference: dto.reference,
              notes: dto.notes,
              status: 'RECORDED',
              createdBy: userId,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const existing = await this.prisma.payment.findFirst({
            where: { paymentNumber },
            select: { id: true },
          });
          if (existing)
            throw new ConflictException(`Payment number ${paymentNumber} already exists`);
        }
        if (error.code === 'P2034') {
          throw new ConflictException('Purchase order balance changed; retry the payment');
        }
      }
      throw error;
    }

    await this._createAuditLog(businessId, userId, 'Payment', payment.id, 'CREATE', {
      action: 'Purchase order payment recorded',
      paymentNumber,
      poId,
      amount: payment.amount,
    });
    return {
      id: payment.id,
      businessId: payment.businessId,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      supplierId: payment.supplierId,
      purchaseOrderId: payment.poId,
      amount: payment.amount,
      paymentMethodId: payment.paymentMethodId,
      reference: payment.reference,
      notes: payment.notes,
      status: payment.status,
      createdAt: payment.createdAt,
    };
  }

  /**
   * GET ALL PURCHASE ORDERS
   */
  async getAllPurchaseOrders(
    businessId: string,
    filter: PurchaseOrderFilterDto,
  ): Promise<{ data: PurchaseOrderResponseDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Math.floor(Number(filter.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(filter.limit) || 20)));
    const skip = (page - 1) * limit;

    const orderDate: Prisma.DateTimeFilter = {};
    if (filter.dateFrom) {
      const from = new Date(filter.dateFrom);
      if (Number.isNaN(from.getTime())) throw new BadRequestException('Invalid dateFrom');
      orderDate.gte = from;
    }
    if (filter.dateTo) {
      const to = new Date(filter.dateTo);
      if (Number.isNaN(to.getTime())) throw new BadRequestException('Invalid dateTo');
      // dateTo is an inclusive calendar date; use next-day exclusive bound.
      to.setUTCHours(0, 0, 0, 0);
      to.setUTCDate(to.getUTCDate() + 1);
      orderDate.lt = to;
    }

    const where: Prisma.PurchaseOrderWhereInput = {
      businessId,
      ...(filter.status && { status: filter.status }),
      ...(filter.supplierId && { supplierId: filter.supplierId }),
      ...(filter.search && {
        OR: [
          { poNumber: { contains: filter.search, mode: 'insensitive' } },
          { supplier: { name: { contains: filter.search, mode: 'insensitive' } } },
        ],
      }),
      ...(Object.keys(orderDate).length > 0 && { orderDate }),
    };

    let orderBy: Prisma.PurchaseOrderOrderByWithRelationInput = { createdAt: 'desc' };
    if (filter.sortBy) {
      const direction = filter.sortOrder === 'asc' ? 'asc' : 'desc';
      switch (filter.sortBy) {
        case 'poNumber':
          orderBy = { poNumber: direction };
          break;
        case 'totalAmount':
          orderBy = { totalAmount: direction };
          break;
        case 'orderDate':
          orderBy = { orderDate: direction };
          break;
        case 'createdAt':
          orderBy = { createdAt: direction };
          break;
      }
    }

    const [pos, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    const responses = await Promise.all(
      pos.map((po) => this.getPurchaseOrderById(businessId, po.id)),
    );

    return {
      data: responses,
      total,
      page,
      limit,
    };
  }

  /**
   * UPDATE PURCHASE ORDER
   */
  async updatePurchaseOrder(
    businessId: string,
    poId: string,
    userId: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`[PURCHASES] Updating PO: ${poId}`);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, businessId },
      include: { items: true },
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    if (po.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT purchase orders can be updated');
    }

    const supplierId = dto.supplierId ?? po.supplierId;
    const locationId = dto.locationId ?? po.locationId;
    if (
      dto.supplierId &&
      !(await this.prisma.supplier.findFirst({ where: { id: supplierId, businessId } }))
    ) {
      throw new NotFoundException('Supplier not found');
    }
    if (
      dto.locationId &&
      !(await this.prisma.location.findFirst({ where: { id: locationId, businessId } }))
    ) {
      throw new NotFoundException('Location not found');
    }
    if (dto.items) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: dto.items.map((item) => item.productId) }, businessId },
        select: { id: true },
      });
      const productIds = new Set(products.map((product) => product.id));
      for (const item of dto.items)
        if (!productIds.has(item.productId)) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }
    }

    const shippingCost =
      dto.shippingCost !== undefined ? roundMoney(Number(dto.shippingCost)) : po.shippingCost;
    const nextItems = dto.items?.map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const discount = Number(item.discount || 0);
      const lineTotal = roundMoney(quantity * unitPrice - discount);
      if (!Number.isFinite(lineTotal) || lineTotal < 0) {
        throw new BadRequestException('Item discount cannot exceed its gross amount');
      }
      return {
        productId: item.productId,
        quantity,
        unitPrice,
        discount,
        lineTotal,
        notes: item.notes,
      };
    });
    const subtotal = nextItems
      ? roundMoney(nextItems.reduce((sum, item) => sum + item.lineTotal, 0))
      : po.subtotal;
    const taxAmount =
      dto.taxAmount !== undefined
        ? roundMoney(Number(dto.taxAmount))
        : dto.taxPercentage !== undefined
          ? roundMoney((subtotal * Number(dto.taxPercentage)) / 100)
          : po.taxAmount;

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          supplierId,
          locationId,
          shippingCost,
          taxAmount,
          totalAmount: roundMoney(subtotal + shippingCost + taxAmount),
          ...(dto.expectedDeliveryDate !== undefined && {
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : null,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.referenceNumber !== undefined && { referenceNumber: dto.referenceNumber }),
          subtotal,
        },
      });
      if (nextItems) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } });
        if (nextItems.length)
          await tx.purchaseOrderItem.createMany({
            data: nextItems.map((item) => ({ id: uuid(), purchaseOrderId: poId, ...item })),
          });
      }
    });

    await this._createAuditLog(businessId, userId, 'PurchaseOrder', poId, 'UPDATE', {
      action: 'Purchase Order updated',
      fields: Object.keys(dto),
    });

    this.logger.log(`[PURCHASES] PO updated: ${poId}`);

    const response = await this.getPurchaseOrderById(businessId, poId);
    return response;
  }

  /**
   * APPROVE PURCHASE ORDER
   */
  async approvePurchaseOrder(
    businessId: string,
    poId: string,
    userId: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`[PURCHASES] Approving PO: ${poId}`);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, businessId },
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    if (po.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT purchase orders can be approved');
    }

    const approved = await this.prisma.purchaseOrder.updateMany({
      where: { id: poId, businessId, status: 'DRAFT' },
      data: { status: 'ORDERED', approvedBy: userId, approvedAt: new Date() },
    });
    if (approved.count !== 1)
      throw new BadRequestException('Purchase order has already been processed');

    await this._createAuditLog(businessId, userId, 'PurchaseOrder', poId, 'APPROVE', {
      action: 'Purchase Order approved',
      newStatus: 'ORDERED',
    });

    this.logger.log(`[PURCHASES] PO approved: ${poId}`);

    const response = await this.getPurchaseOrderById(businessId, poId);
    const supplier = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, businessId },
      select: { supplier: { select: { name: true, email: true } } },
    });
    await this.notifications.publishEvent({
      businessId,
      eventType: NotificationEventType.PURCHASE_ORDER_APPROVED,
      referenceId: poId,
      referenceType: 'PurchaseOrder',
      variables: {
        poNumber: response.poNumber,
        supplierName: response.supplierName,
        totalAmount: response.totalAmount,
      },
      externalRecipients: supplier?.supplier.email
        ? [{ email: supplier.supplier.email, name: supplier.supplier.name }]
        : [],
    });
    return response;
  }

  /**
   * CANCEL PURCHASE ORDER
   */
  async cancelPurchaseOrder(
    businessId: string,
    poId: string,
    userId: string,
    reason: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`[PURCHASES] Cancelling PO: ${poId}`);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, businessId },
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    if (po.status === 'CANCELLED' || po.status === 'FULLY_RECEIVED') {
      throw new BadRequestException(`Cannot cancel PO with status: ${po.status}`);
    }

    const cancelled = await this.prisma.purchaseOrder.updateMany({
      where: { id: poId, businessId, status: po.status },
      data: {
        status: 'CANCELLED',
        cancelledBy: userId,
        cancelledAt: new Date(),
        notes: `${po.notes || ''}\n[CANCELLED: ${reason || 'No reason provided'}]`,
      },
    });
    if (cancelled.count !== 1)
      throw new BadRequestException('Purchase order status changed; reload and retry');

    await this._createAuditLog(businessId, userId, 'PurchaseOrder', poId, 'CANCEL', {
      action: 'Purchase Order cancelled',
      reason,
    });

    this.logger.log(`[PURCHASES] PO cancelled: ${poId}`);

    return this.getPurchaseOrderById(businessId, poId);
  }

  // ============================================================
  // GOODS RECEIVED NOTE (GRN)
  // ============================================================

  /**
   * CREATE GRN
   */
  async createGRN(businessId: string, userId: string, dto: CreateGRNDto): Promise<GRNResponseDto> {
    this.logger.log(`[PURCHASES] Creating GRN for PO: ${dto.purchaseOrderId}`);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: dto.purchaseOrderId,
        businessId,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        supplier: true,
        location: true,
      },
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw new BadRequestException('GRNs can only be created for approved, open purchase orders');
    }

    const seenItems = new Set<string>();
    for (const item of dto.items) {
      const poItem = po.items.find((pi) => pi.id === item.purchaseOrderItemId);
      if (!poItem)
        throw new BadRequestException(`Item ${item.purchaseOrderItemId} not found in PO`);
      if (seenItems.has(item.purchaseOrderItemId)) {
        throw new BadRequestException('A PO item can only appear once in a GRN');
      }
      seenItems.add(item.purchaseOrderItemId);
      const received = Number(item.receivedQuantity);
      const accepted = Number(item.acceptedQuantity);
      const rejected = Number(item.rejectedQuantity);
      const damaged = Number(item.damageQuantity);
      if (
        ![received, accepted, rejected, damaged].every(Number.isFinite) ||
        Math.abs(received - accepted - rejected - damaged) > 1e-8
      ) {
        throw new BadRequestException(
          'Received quantity must equal accepted + rejected + damaged quantities',
        );
      }
      if (
        poItem.product.requiresExpiry &&
        accepted > 0 &&
        (!item.expiryDate || !item.batchNumber?.trim())
      ) {
        throw new BadRequestException(
          `Batch number and expiry date are required for ${poItem.product.name}`,
        );
      }
    }

    let grnNumber = dto.grnNumber;
    if (grnNumber) {
      const existingGrn = await this.prisma.goodsReceivedNote.findFirst({
        where: { businessId, grnNumber },
        select: { id: true },
      });
      if (existingGrn) {
        throw new ConflictException(`GRN number ${grnNumber} already exists`);
      }
    }

    let grn;
    try {
      grn = await this.prisma.$transaction(async (tx) => {
        if (!grnNumber) {
          await this._lockNumberSequence(tx, businessId, 'GoodsReceivedNote');
          grnNumber = await this._generateGRNNumber(businessId, tx);
        }
        const existingGrn = await tx.goodsReceivedNote.findFirst({
          where: { businessId, grnNumber },
          select: { id: true },
        });
        if (existingGrn) {
          throw new ConflictException(`GRN number ${grnNumber} already exists`);
        }

        const priorItems = await tx.gRNItem.findMany({
          where: { grn: { purchaseOrderId: po.id, status: { not: 'REJECTED' } } },
        });
        const acceptedOrReserved = new Map<string, number>();
        for (const row of priorItems) {
          acceptedOrReserved.set(
            row.purchaseOrderItemId,
            (acceptedOrReserved.get(row.purchaseOrderItemId) || 0) + row.acceptedQuantity,
          );
        }
        for (const item of dto.items) {
          const poItem = po.items.find((candidate) => candidate.id === item.purchaseOrderItemId)!;
          const totalAccepted =
            (acceptedOrReserved.get(poItem.id) || 0) + Number(item.acceptedQuantity);
          if (totalAccepted > poItem.quantity + 1e-8) {
            throw new BadRequestException(
              `Accepted quantity exceeds ordered quantity for ${poItem.product.name}`,
            );
          }
        }
        const created = await tx.goodsReceivedNote.create({
          data: {
            id: uuid(),
            businessId,
            grnNumber,
            purchaseOrderId: dto.purchaseOrderId,
            status: 'RECEIVED',
            receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
            vehicleRegistration: dto.vehicleRegistration,
            driverName: dto.driverName,
            waybillNumber: dto.waybillNumber,
            notes: dto.notes,
            receivedBy: userId,
          },
        });
        await tx.gRNItem.createMany({
          data: dto.items.map((item) => ({
            id: uuid(),
            grnId: created.id,
            purchaseOrderItemId: item.purchaseOrderItemId,
            receivedQuantity: Number(item.receivedQuantity),
            acceptedQuantity: Number(item.acceptedQuantity),
            rejectedQuantity: Number(item.rejectedQuantity),
            damageQuantity: Number(item.damageQuantity),
            notes: item.notes,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
          })),
        });
        return created;
      });
    } catch (error) {
      // The pre-check gives a clear error in the normal case. Keep the unique
      // constraint as the final guard if concurrent requests choose the same
      // GRN number between the check and the insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.goodsReceivedNote.findFirst({
          where: { businessId, grnNumber: grnNumber! },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(`GRN number ${grnNumber} already exists`);
        }
      }
      throw error;
    }

    await this._createAuditLog(businessId, userId, 'GoodsReceivedNote', grn.id, 'CREATE', {
      action: 'GRN created',
      grnNumber: grn.grnNumber,
      purchaseOrderId: dto.purchaseOrderId,
    });

    this.logger.log(`[PURCHASES] GRN created: ${grn.id} (${grnNumber})`);

    return this.getGRNById(businessId, grn.id);
  }

  /**
   * GET GRN BY ID
   */
  async getGRNById(businessId: string, grnId: string): Promise<GRNResponseDto> {
    const grn = await this.prisma.goodsReceivedNote.findFirst({
      where: {
        id: grnId,
        businessId,
      },
      include: {
        purchaseOrder: {
          include: {
            supplier: true,
            location: true,
          },
        },
        items: {
          include: {
            purchaseOrderItem: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!grn) {
      throw new NotFoundException('GRN not found');
    }

    const totalReceivedQty = grn.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
    const totalAcceptedQty = grn.items.reduce((sum, item) => sum + item.acceptedQuantity, 0);
    const totalRejectedQty = grn.items.reduce((sum, item) => sum + item.rejectedQuantity, 0);
    const totalDamageQty = grn.items.reduce((sum, item) => sum + item.damageQuantity, 0);

    return {
      id: grn.id,
      businessId: grn.businessId,
      grnNumber: grn.grnNumber,
      purchaseOrderId: grn.purchaseOrderId,
      poNumber: grn.purchaseOrder.poNumber,
      supplierId: grn.purchaseOrder.supplierId,
      supplierName: grn.purchaseOrder.supplier.name,
      locationId: grn.purchaseOrder.locationId,
      locationName: grn.purchaseOrder.location.name,
      status: grn.status,
      items: grn.items.map((item) => ({
        id: item.id,
        grnId: item.grnId,
        purchaseOrderItemId: item.purchaseOrderItemId,
        productId: item.purchaseOrderItem.productId,
        productName: item.purchaseOrderItem.product?.name || '',
        productSku: item.purchaseOrderItem.product?.sku || '',
        receivedQuantity: item.receivedQuantity,
        acceptedQuantity: item.acceptedQuantity,
        rejectedQuantity: item.rejectedQuantity,
        damageQuantity: item.damageQuantity,
        notes: item.notes,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
      })),
      totalReceivedQty,
      totalAcceptedQty,
      totalRejectedQty,
      totalDamageQty,
      vehicleRegistration: grn.vehicleRegistration,
      driverName: grn.driverName,
      waybillNumber: grn.waybillNumber,
      receivedBy: grn.receivedBy,
      receivedDate: grn.receivedDate,
      notes: grn.notes,
      createdAt: grn.createdAt,
      updatedAt: grn.updatedAt,
    };
  }

  /**
   * GET ALL GRNs
   */
  async getAllGRNs(businessId: string, poId?: string): Promise<GRNResponseDto[]> {
    const grns = await this.prisma.goodsReceivedNote.findMany({
      where: {
        businessId,
        ...(poId && { purchaseOrderId: poId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(grns.map((grn) => this.getGRNById(businessId, grn.id)));
  }

  /**
   * UPDATE GRN
   */
  async updateGRN(
    businessId: string,
    grnId: string,
    userId: string,
    dto: UpdateGRNDto,
  ): Promise<GRNResponseDto> {
    this.logger.log(`[PURCHASES] Updating GRN: ${grnId}`);

    await this.prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceivedNote.findFirst({
        where: { id: grnId, businessId },
        include: {
          purchaseOrder: { include: { items: { include: { product: true } } } },
          items: true,
        },
      });
      if (!grn) throw new NotFoundException('GRN not found');
      if (grn.status !== 'RECEIVED')
        throw new BadRequestException('Only RECEIVED GRNs can be updated');

      if (dto.items) {
        const requestedUpdates = dto.items.map((item, index) => ({
          ...item,
          purchaseOrderItemId: item.purchaseOrderItemId || grn.items[index]?.purchaseOrderItemId,
        }));
        const updatesByItem = new Map<string, (typeof requestedUpdates)[number]>();
        for (const item of requestedUpdates) {
          const poItemId = item.purchaseOrderItemId;
          if (!poItemId) throw new BadRequestException('Each GRN item must identify a PO item');
          const poItem = grn.purchaseOrder.items.find((candidate) => candidate.id === poItemId);
          if (!poItem) throw new BadRequestException(`Item ${poItemId} not found in PO`);
          if (updatesByItem.has(poItemId))
            throw new BadRequestException('A PO item can only appear once in a GRN');
          updatesByItem.set(poItemId, item);
        }
        const updatedItems = grn.items.map((prior) => {
          const update = updatesByItem.get(prior.purchaseOrderItemId);
          return {
            purchaseOrderItemId: prior.purchaseOrderItemId,
            receivedQuantity: update?.receivedQuantity ?? prior.receivedQuantity,
            acceptedQuantity: update?.acceptedQuantity ?? prior.acceptedQuantity,
            rejectedQuantity: update?.rejectedQuantity ?? prior.rejectedQuantity,
            damageQuantity: update?.damageQuantity ?? prior.damageQuantity,
            notes: update?.notes ?? prior.notes,
            batchNumber: update?.batchNumber ?? prior.batchNumber,
            expiryDate: update?.expiryDate ? new Date(update.expiryDate) : prior.expiryDate,
          };
        });
        for (const item of requestedUpdates) {
          if (grn.items.some((prior) => prior.purchaseOrderItemId === item.purchaseOrderItemId))
            continue;
          if (
            item.receivedQuantity === undefined ||
            item.acceptedQuantity === undefined ||
            item.rejectedQuantity === undefined ||
            item.damageQuantity === undefined
          ) {
            throw new BadRequestException(
              'All quantities are required when adding a PO item to a GRN',
            );
          }
          updatedItems.push({
            purchaseOrderItemId: item.purchaseOrderItemId!,
            receivedQuantity: item.receivedQuantity,
            acceptedQuantity: item.acceptedQuantity,
            rejectedQuantity: item.rejectedQuantity,
            damageQuantity: item.damageQuantity,
            notes: item.notes,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          });
        }
        for (const item of updatedItems) {
          if (
            Math.abs(
              item.receivedQuantity -
                item.acceptedQuantity -
                item.rejectedQuantity -
                item.damageQuantity,
            ) > 1e-8
          ) {
            throw new BadRequestException(
              'Received quantity must equal accepted + rejected + damaged quantities',
            );
          }
          const poItem = grn.purchaseOrder.items.find(
            (candidate) => candidate.id === item.purchaseOrderItemId,
          )!;
          if (
            poItem.product.requiresExpiry &&
            item.acceptedQuantity > 0 &&
            (!item.expiryDate || !item.batchNumber?.trim())
          ) {
            throw new BadRequestException(
              `Batch number and expiry date are required for ${poItem.product.name}`,
            );
          }
        }
        const otherGrns = await tx.goodsReceivedNote.findMany({
          where: {
            purchaseOrderId: grn.purchaseOrderId,
            id: { not: grnId },
            status: { not: 'REJECTED' },
          },
          include: { items: true },
        });
        const acceptedOrReserved = new Map<string, number>();
        for (const other of otherGrns)
          for (const item of other.items) {
            acceptedOrReserved.set(
              item.purchaseOrderItemId,
              (acceptedOrReserved.get(item.purchaseOrderItemId) || 0) + item.acceptedQuantity,
            );
          }
        for (const item of updatedItems) {
          const poItem = grn.purchaseOrder.items.find(
            (candidate) => candidate.id === item.purchaseOrderItemId,
          )!;
          if (
            (acceptedOrReserved.get(poItem.id) || 0) + item.acceptedQuantity >
            poItem.quantity + 1e-8
          ) {
            throw new BadRequestException(
              `Accepted quantity exceeds ordered quantity for ${poItem.productId}`,
            );
          }
        }
        await tx.gRNItem.deleteMany({ where: { grnId } });
        if (updatedItems.length)
          await tx.gRNItem.createMany({
            data: updatedItems.map((item) => ({ id: uuid(), grnId, ...item })),
          });
      }
      await tx.goodsReceivedNote.update({
        where: { id: grnId },
        data: {
          ...(dto.receivedDate && { receivedDate: new Date(dto.receivedDate) }),
          ...(dto.vehicleRegistration !== undefined && {
            vehicleRegistration: dto.vehicleRegistration,
          }),
          ...(dto.driverName !== undefined && { driverName: dto.driverName }),
          ...(dto.waybillNumber !== undefined && { waybillNumber: dto.waybillNumber }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });
    });

    await this._createAuditLog(businessId, userId, 'GoodsReceivedNote', grnId, 'UPDATE', {
      action: 'GRN updated',
      fields: Object.keys(dto),
    });

    this.logger.log(`[PURCHASES] GRN updated: ${grnId}`);

    return this.getGRNById(businessId, grnId);
  }

  /**
   * ACCEPT GRN
   */
  async acceptGRN(businessId: string, grnId: string, userId: string): Promise<GRNResponseDto> {
    this.logger.log(`[PURCHASES] Accepting GRN: ${grnId}`);

    await this.prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceivedNote.findFirst({
        where: { id: grnId, businessId },
        include: { purchaseOrder: { include: { supplier: true, items: true } }, items: true },
      });
      if (!grn) throw new NotFoundException('GRN not found');
      await assertAccountingPeriodOpen(tx, businessId, grn.receivedDate);
      if (grn.status !== 'RECEIVED')
        throw new BadRequestException('Only RECEIVED GRNs can be accepted');
      if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(grn.purchaseOrder.status)) {
        throw new BadRequestException('Purchase order is not open for receiving');
      }

      const claimed = await tx.goodsReceivedNote.updateMany({
        where: { id: grnId, businessId, status: 'RECEIVED' },
        data: { status: 'ACCEPTED' },
      });
      if (claimed.count !== 1) throw new BadRequestException('GRN has already been processed');

      for (const item of grn.items) {
        const poItem = grn.purchaseOrder.items.find(
          (candidate) => candidate.id === item.purchaseOrderItemId,
        );
        if (!poItem)
          throw new BadRequestException('GRN contains an item outside its purchase order');
        if (item.acceptedQuantity > 0) {
          await tx.stockBalance.upsert({
            where: {
              productId_locationId: {
                productId: poItem.productId,
                locationId: grn.purchaseOrder.locationId,
              },
            },
            create: {
              id: uuid(),
              productId: poItem.productId,
              locationId: grn.purchaseOrder.locationId,
              quantity: item.acceptedQuantity,
              lastMovementAt: new Date(),
            },
            update: { quantity: { increment: item.acceptedQuantity }, lastMovementAt: new Date() },
          });
          await tx.inventoryMovement.create({
            data: {
              id: uuid(),
              businessId,
              productId: poItem.productId,
              locationId: grn.purchaseOrder.locationId,
              type: 'PURCHASE',
              quantity: item.acceptedQuantity,
              referenceId: grn.id,
              referenceType: 'GoodsReceivedNote',
              notes: `Received from ${grn.purchaseOrder.supplier.name} (GRN: ${grn.grnNumber})`,
              unitCost: poItem.quantity > 0 ? poItem.lineTotal / poItem.quantity : poItem.unitPrice,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              createdBy: userId,
            },
          });
        }
      }
      await this._refreshPurchaseOrderReceivingStatus(tx, grn.purchaseOrderId);
    });

    await this._createAuditLog(businessId, userId, 'GoodsReceivedNote', grnId, 'ACCEPT', {
      action: 'GRN accepted',
    });

    this.logger.log(`[PURCHASES] GRN accepted: ${grnId}`);

    return this.getGRNById(businessId, grnId);
  }

  /**
   * REJECT GRN
   */
  async rejectGRN(
    businessId: string,
    grnId: string,
    userId: string,
    reason: string,
  ): Promise<GRNResponseDto> {
    this.logger.log(`[PURCHASES] Rejecting GRN: ${grnId}`);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.goodsReceivedNote.findFirst({ where: { id: grnId, businessId } });
      if (!existing) throw new NotFoundException('GRN not found');
      if (existing.status !== 'RECEIVED')
        throw new BadRequestException('Only RECEIVED GRNs can be rejected');
      const result = await tx.goodsReceivedNote.updateMany({
        where: { id: grnId, businessId, status: 'RECEIVED' },
        data: {
          status: 'REJECTED',
          notes: `${existing.notes || ''}\n[REJECTED: ${reason || 'No reason provided'}]`,
        },
      });
      if (result.count !== 1) throw new BadRequestException('GRN has already been processed');
      await this._refreshPurchaseOrderReceivingStatus(tx, existing.purchaseOrderId);
      return existing;
    });

    await this._createAuditLog(businessId, userId, 'GoodsReceivedNote', grnId, 'REJECT', {
      action: 'GRN rejected',
      reason,
    });

    this.logger.log(`[PURCHASES] GRN rejected: ${grnId}`);

    return this.getGRNById(businessId, grnId);
  }

  // ============================================================
  // PURCHASE RETURNS
  // ============================================================

  /**
   * CREATE PURCHASE RETURN
   */
  async createPurchaseReturn(
    businessId: string,
    userId: string,
    dto: CreatePurchaseReturnDto,
  ): Promise<PurchaseReturnResponseDto> {
    this.logger.log(`[PURCHASES] Creating purchase return for PO: ${dto.purchaseOrderId}`);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: dto.purchaseOrderId,
        businessId,
      },
      include: {
        items: true,
        supplier: true,
      },
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    const acceptedGrnItems = await this.prisma.gRNItem.findMany({
      where: { grn: { purchaseOrderId: po.id, status: 'ACCEPTED' } },
    });
    const existingReturns = await this.prisma.purchaseReturn.findMany({
      where: { purchaseOrderId: po.id, status: { in: ['DRAFT', 'APPROVED'] } },
      include: { items: true },
    });
    const receivedByItem = new Map<string, number>();
    const returnedByItem = new Map<string, number>();
    for (const item of acceptedGrnItems)
      receivedByItem.set(
        item.purchaseOrderItemId,
        (receivedByItem.get(item.purchaseOrderItemId) || 0) + item.acceptedQuantity,
      );
    for (const ret of existingReturns)
      for (const item of ret.items)
        returnedByItem.set(
          item.purchaseOrderItemId,
          (returnedByItem.get(item.purchaseOrderItemId) || 0) + item.quantity,
        );

    const requestedByItem = new Map<string, number>();
    for (const item of dto.items) {
      const poItem = po.items.find((pi) => pi.id === item.purchaseOrderItemId);
      if (!poItem) {
        throw new BadRequestException(`Item ${item.purchaseOrderItemId} not found in PO`);
      }
      const requested = (requestedByItem.get(poItem.id) || 0) + Number(item.quantity);
      requestedByItem.set(poItem.id, requested);
      const availableToReturn =
        (receivedByItem.get(poItem.id) || 0) - (returnedByItem.get(poItem.id) || 0);
      if (requested > availableToReturn + 1e-8) {
        throw new BadRequestException(
          `Return quantity exceeds accepted, unreturned quantity for ${poItem.productId}`,
        );
      }
    }

    let returnNumber = dto.returnNumber;
    if (returnNumber) {
      const existingReturn = await this.prisma.purchaseReturn.findFirst({
        where: { businessId, returnNumber },
        select: { id: true },
      });
      if (existingReturn) {
        throw new ConflictException(`Return number ${returnNumber} already exists`);
      }
    }

    let totalReturnAmount = 0;
    const returnItems = [];

    for (const item of dto.items) {
      const poItem = po.items.find((pi) => pi.id === item.purchaseOrderItemId);
      const qty = Number(item.quantity);
      const netUnitPrice =
        poItem.quantity > 0
          ? poItem.unitPrice - poItem.discount / poItem.quantity
          : poItem.unitPrice;
      const itemReturnAmount = qty * Math.max(0, netUnitPrice);
      totalReturnAmount += itemReturnAmount;

      returnItems.push({
        purchaseOrderItemId: item.purchaseOrderItemId,
        quantity: qty,
        reason: item.reason,
        notes: item.notes,
      });
    }

    let purchaseReturn;
    try {
      purchaseReturn = await this.prisma.$transaction(async (tx) => {
        if (!returnNumber) {
          await this._lockNumberSequence(tx, businessId, 'PurchaseReturn');
          returnNumber = await this._generateReturnNumber(businessId, tx);
        }
        const existingReturn = await tx.purchaseReturn.findFirst({
          where: { businessId, returnNumber },
          select: { id: true },
        });
        if (existingReturn) {
          throw new ConflictException(`Return number ${returnNumber} already exists`);
        }

        const created = await tx.purchaseReturn.create({
          data: {
            id: uuid(),
            businessId,
            returnNumber,
            purchaseOrderId: dto.purchaseOrderId,
            supplierId: po.supplierId,
            status: 'DRAFT',
            totalReturnAmount,
            notes: dto.notes,
            createdBy: userId,
          },
        });
        await tx.purchaseReturnItem.createMany({
          data: returnItems.map((item) => ({ id: uuid(), purchaseReturnId: created.id, ...item })),
        });
        return created;
      });
    } catch (error) {
      // Keep a readable conflict response if another request wins the unique-key race.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.purchaseReturn.findFirst({
          where: { businessId, returnNumber: returnNumber! },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(`Return number ${returnNumber} already exists`);
        }
      }
      throw error;
    }

    await this._createAuditLog(businessId, userId, 'PurchaseReturn', purchaseReturn.id, 'CREATE', {
      action: 'Purchase return created',
      returnNumber: purchaseReturn.returnNumber,
    });

    this.logger.log(`[PURCHASES] Purchase return created: ${purchaseReturn.id} (${returnNumber})`);

    return this.getPurchaseReturnById(businessId, purchaseReturn.id);
  }

  /**
   * GET PURCHASE RETURN BY ID
   */
  async getPurchaseReturnById(
    businessId: string,
    returnId: string,
  ): Promise<PurchaseReturnResponseDto> {
    const purchaseReturn = await this.prisma.purchaseReturn.findFirst({
      where: {
        id: returnId,
        businessId,
      },
      include: {
        purchaseOrder: true,
        supplier: true,
        items: {
          include: {
            purchaseOrderItem: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!purchaseReturn) {
      throw new NotFoundException('Purchase return not found');
    }

    return {
      id: purchaseReturn.id,
      businessId: purchaseReturn.businessId,
      returnNumber: purchaseReturn.returnNumber,
      purchaseOrderId: purchaseReturn.purchaseOrderId,
      poNumber: purchaseReturn.purchaseOrder?.poNumber || '',
      supplierId: purchaseReturn.supplierId,
      supplierName: purchaseReturn.supplier.name,
      status: purchaseReturn.status,
      items: purchaseReturn.items.map((item) => ({
        id: item.id,
        purchaseReturnId: item.purchaseReturnId,
        purchaseOrderItemId: item.purchaseOrderItemId,
        productId: item.purchaseOrderItem.productId,
        productName: item.purchaseOrderItem.product?.name || '',
        productSku: item.purchaseOrderItem.product?.sku || '',
        quantity: item.quantity,
        reason: item.reason,
        notes: item.notes,
      })),
      totalReturnAmount: purchaseReturn.totalReturnAmount,
      approvedBy: purchaseReturn.approvedBy,
      approvedAt: purchaseReturn.approvedAt,
      notes: purchaseReturn.notes,
      createdAt: purchaseReturn.createdAt,
      updatedAt: purchaseReturn.updatedAt,
    };
  }

  /**
   * GET ALL PURCHASE RETURNS
   */
  async getAllPurchaseReturns(
    businessId: string,
    poId?: string,
  ): Promise<PurchaseReturnResponseDto[]> {
    const returns = await this.prisma.purchaseReturn.findMany({
      where: {
        businessId,
        ...(poId && { purchaseOrderId: poId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(returns.map((ret) => this.getPurchaseReturnById(businessId, ret.id)));
  }

  /**
   * APPROVE PURCHASE RETURN
   */
  async approvePurchaseReturn(
    businessId: string,
    returnId: string,
    userId: string,
  ): Promise<PurchaseReturnResponseDto> {
    this.logger.log(`[PURCHASES] Approving purchase return: ${returnId}`);

    await this.prisma.$transaction(async (tx) => {
      const ret = await tx.purchaseReturn.findFirst({
        where: { id: returnId, businessId },
        include: { purchaseOrder: true, items: { include: { purchaseOrderItem: true } } },
      });
      if (!ret) throw new NotFoundException('Purchase return not found');
      if (ret.status !== 'DRAFT')
        throw new BadRequestException('Only DRAFT returns can be approved');

      const claimed = await tx.purchaseReturn.updateMany({
        where: { id: returnId, businessId, status: 'DRAFT' },
        data: { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new BadRequestException('Purchase return has already been processed');

      for (const item of ret.items) {
        const result = await tx.stockBalance.updateMany({
          where: {
            productId: item.purchaseOrderItem.productId,
            locationId: ret.purchaseOrder.locationId,
            quantity: { gte: item.quantity },
          },
          data: { quantity: { decrement: item.quantity }, lastMovementAt: new Date() },
        });
        if (result.count !== 1) {
          throw new BadRequestException(
            `Insufficient stock to approve return for ${item.purchaseOrderItem.productId}`,
          );
        }
        await tx.inventoryMovement.create({
          data: {
            id: uuid(),
            businessId,
            productId: item.purchaseOrderItem.productId,
            locationId: ret.purchaseOrder.locationId,
            type: 'PURCHASE_RETURN',
            quantity: -item.quantity,
            referenceId: ret.id,
            referenceType: 'PurchaseReturn',
            notes: `Returned to ${ret.supplierId} (Return: ${ret.returnNumber})`,
            createdBy: userId,
          },
        });
      }
      return ret;
    });

    await this._createAuditLog(businessId, userId, 'PurchaseReturn', returnId, 'APPROVE', {
      action: 'Purchase return approved',
    });

    this.logger.log(`[PURCHASES] Purchase return approved: ${returnId}`);

    return this.getPurchaseReturnById(businessId, returnId);
  }

  /**
   * REJECT PURCHASE RETURN
   */
  async rejectPurchaseReturn(
    businessId: string,
    returnId: string,
    userId: string,
    reason: string,
  ): Promise<PurchaseReturnResponseDto> {
    this.logger.log(`[PURCHASES] Rejecting purchase return: ${returnId}`);

    const purchaseReturn = await this.prisma.purchaseReturn.findFirst({
      where: { id: returnId, businessId },
    });

    if (!purchaseReturn) {
      throw new NotFoundException('Purchase return not found');
    }

    if (purchaseReturn.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT returns can be rejected');
    }

    await this.prisma.purchaseReturn.update({
      where: { id: returnId },
      data: {
        status: 'REJECTED',
        notes: `${purchaseReturn.notes || ''}\n[REJECTED: ${reason || 'No reason provided'}]`,
      },
    });

    await this._createAuditLog(businessId, userId, 'PurchaseReturn', returnId, 'REJECT', {
      action: 'Purchase return rejected',
      reason,
    });

    this.logger.log(`[PURCHASES] Purchase return rejected: ${returnId}`);

    return this.getPurchaseReturnById(businessId, returnId);
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async _refreshPurchaseOrderReceivingStatus(
    tx: Prisma.TransactionClient,
    purchaseOrderId: string,
  ): Promise<void> {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!po || po.status === 'CANCELLED') return;

    const acceptedItems = await tx.gRNItem.findMany({
      where: { grn: { purchaseOrderId, status: 'ACCEPTED' } },
    });
    const acceptedByPoItem = new Map<string, number>();
    for (const item of acceptedItems) {
      acceptedByPoItem.set(
        item.purchaseOrderItemId,
        (acceptedByPoItem.get(item.purchaseOrderItemId) || 0) + item.acceptedQuantity,
      );
    }
    const totalAccepted = Array.from(acceptedByPoItem.values()).reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const fullyReceived = po.items.every(
      (item) => (acceptedByPoItem.get(item.id) || 0) >= item.quantity - 1e-8,
    );
    const status = fullyReceived
      ? 'FULLY_RECEIVED'
      : totalAccepted > 0
        ? 'PARTIALLY_RECEIVED'
        : 'ORDERED';
    await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status } });
  }

  private async _lockNumberSequence(
    tx: Prisma.TransactionClient,
    businessId: string,
    resource: string,
  ): Promise<void> {
    const key = `${resource}:${businessId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS acquired`;
  }

  private async _generatePONumber(
    businessId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const month = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `PO-${month}-`;
    const numbers = await tx.purchaseOrder.findMany({
      where: { businessId, poNumber: { startsWith: prefix } },
      select: { poNumber: true },
    });
    const next =
      numbers.reduce(
        (maximum, row) => Math.max(maximum, Number(row.poNumber.slice(prefix.length)) || 0),
        0,
      ) + 1;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  private async _generateGRNNumber(
    businessId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const month = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `GRN-${month}-`;
    const numbers = await tx.goodsReceivedNote.findMany({
      where: { businessId, grnNumber: { startsWith: prefix } },
      select: { grnNumber: true },
    });
    const next =
      numbers.reduce(
        (maximum, row) => Math.max(maximum, Number(row.grnNumber.slice(prefix.length)) || 0),
        0,
      ) + 1;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  private async _generateReturnNumber(
    businessId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const month = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `RET-${month}-`;
    const numbers = await tx.purchaseReturn.findMany({
      where: { businessId, returnNumber: { startsWith: prefix } },
      select: { returnNumber: true },
    });
    const next =
      numbers.reduce(
        (maximum, row) => Math.max(maximum, Number(row.returnNumber.slice(prefix.length)) || 0),
        0,
      ) + 1;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  private async _createAuditLog(
    businessId: string,
    userId: string,
    entityType: string,
    entityId: string,
    action: string,
    data: any,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: uuid(),
          businessId,
          userId,
          entityType,
          entityId,
          action,
          beforeData: JSON.stringify({}),
          afterData: JSON.stringify(data),
          ipAddress: 'unknown',
        },
      });
    } catch (error) {
      this.logger.error(`[PURCHASES] Failed to create audit log: ${error.message}`);
    }
  }
}
