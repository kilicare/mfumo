import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreatePhysicalCountDto,
  CreateStockAdjustmentDto,
  CreateStockTransferDto,
  InventoryMovementReportDto,
  LowStockReportDto,
  StockAgeingReportDto,
  StockValuationReportDto,
  ExpiryReportDto,
} from './dto';

type Tx = Prisma.TransactionClient;
type MovementLayer = {
  productId: string;
  locationId: string;
  productName: string;
  sku: string;
  locationName: string;
  quantity: number;
  unitCost: number;
  batchNumber: string | null;
  expiryDate: Date | null;
  receivedAt: Date;
  untracked?: boolean;
};
const EPSILON = 1e-8;
const round = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async serializableTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      const isSerializationFailure =
        prismaError?.code === 'P2034' ||
        (prismaError?.code === 'P2010' &&
          (prismaError.meta as { code?: string } | undefined)?.code === '40001');
      if (isSerializationFailure) {
        throw new ConflictException('Inventory changed concurrently; refresh and retry');
      }
      throw error;
    }
  }

  async createStockAdjustment(businessId: string, userId: string, dto: CreateStockAdjustmentDto) {
    this.assertUniqueLines(
      dto.items,
      (i) => `${i.productId}:${i.locationId}:${i.batchNumber || ''}`,
    );
    const now = new Date();
    return this.prisma.$transaction(
      async (tx) => {
        const adjustmentNumber = await this.nextNumber(tx, businessId, 'ADJ', now);
        const data = [];
        for (const line of dto.items) {
          this.assertFinite(line.quantity, 'quantity');
          if (line.quantity === 0)
            throw new BadRequestException('Adjustment quantity must not be zero');
          const [product, location] = await Promise.all([
            tx.product.findFirst({ where: { id: line.productId, businessId, status: 'ACTIVE' } }),
            tx.location.findFirst({ where: { id: line.locationId, businessId, isActive: true } }),
          ]);
          if (!product) throw new NotFoundException(`Active product ${line.productId} not found`);
          if (!location)
            throw new NotFoundException(`Active location ${line.locationId} not found`);
          const stock = await tx.stockBalance.findUnique({
            where: { productId_locationId: { productId: product.id, locationId: location.id } },
          });
          const currentQty = round(stock?.quantity || 0);
          data.push({
            productId: product.id,
            locationId: location.id,
            currentQty,
            adjustedQty: round(currentQty + line.quantity),
            difference: round(line.quantity),
            reason: line.reason,
            batchNumber: line.batchNumber,
            notes: line.notes,
          });
        }
        const adjustment = await tx.stockAdjustment.create({
          data: {
            businessId,
            adjustmentNumber,
            adjustmentDate: now,
            reason: dto.items.map((i) => i.reason).join(', '),
            status: 'PENDING',
            notes: dto.notes,
            createdBy: userId,
            items: { create: data },
          },
          include: { items: { include: { product: true, location: true } } },
        });
        await this.audit(
          tx,
          businessId,
          userId,
          'CREATE',
          'StockAdjustment',
          adjustment.id,
          null,
          adjustment,
        );
        return adjustment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async getStockAdjustmentById(businessId: string, id: string) {
    const result = await this.prisma.stockAdjustment.findFirst({
      where: { id, businessId },
      include: { items: { include: { product: true, location: true } } },
    });
    if (!result) throw new NotFoundException('Stock adjustment not found');
    return result;
  }

  async approveStockAdjustment(businessId: string, id: string, userId: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.stockAdjustment.findFirst({
          where: { id, businessId },
          include: { items: { include: { product: true } } },
        });
        if (!existing) throw new NotFoundException('Stock adjustment not found');
        if (existing.status !== 'PENDING' && existing.status !== 'DRAFT') {
          throw new ConflictException(`Cannot approve adjustment in ${existing.status} status`);
        }
        const approvedAt = new Date();
        const claimed = await tx.stockAdjustment.updateMany({
          where: { id, businessId, status: existing.status },
          data: { status: 'APPROVED', approvedBy: userId, approvedAt },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Stock adjustment has already been processed');
        }
        const business = await tx.business.findUnique({
          where: { id: businessId },
          select: { allowNegativeStock: true },
        });
        for (const item of [...existing.items].sort((a, b) =>
          `${a.productId}:${a.locationId}`.localeCompare(`${b.productId}:${b.locationId}`),
        )) {
          if (!item.locationId)
            throw new ConflictException(
              'This legacy adjustment has no location; create a new adjustment with a location',
            );
          const balance = await this.lockBalance(tx, item.productId, item.locationId);
          const next = round(balance.quantity + item.difference);
          if (!business?.allowNegativeStock && next < -EPSILON) {
            throw new BadRequestException(
              `Adjustment would make ${item.product.name} stock negative`,
            );
          }
          await tx.stockBalance.update({
            where: {
              productId_locationId: { productId: item.productId, locationId: item.locationId },
            },
            data: { quantity: next, lastMovementAt: new Date() },
          });
          await tx.inventoryMovement.create({
            data: {
              businessId,
              productId: item.productId,
              locationId: item.locationId,
              type: 'ADJUSTMENT',
              quantity: item.difference,
              referenceId: existing.id,
              referenceType: 'StockAdjustment',
              notes: item.notes || item.reason,
              unitCost: item.product.buyingPrice,
              batchNumber: item.batchNumber,
              createdBy: userId,
            },
          });
        }
        const updated = await tx.stockAdjustment.findFirst({
          where: { id, businessId },
          include: { items: { include: { product: true, location: true } } },
        });
        if (!updated) throw new NotFoundException('Stock adjustment not found');
        await this.audit(
          tx,
          businessId,
          userId,
          'APPROVE',
          'StockAdjustment',
          id,
          existing,
          updated,
        );
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    await Promise.all(
      result.items
        .filter((item) => item.locationId && item.difference < -EPSILON)
        .map((item) =>
          this.notifications.checkStockLevel(businessId, item.productId, item.locationId!),
        ),
    );
    return result;
  }

  async rejectStockAdjustment(businessId: string, id: string, userId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('A rejection reason is required');
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.stockAdjustment.findFirst({ where: { id, businessId } });
        if (!existing) throw new NotFoundException('Stock adjustment not found');
        if (!['PENDING', 'DRAFT'].includes(existing.status))
          throw new ConflictException('Only pending adjustments can be rejected');
        const rejectedAt = new Date();
        const claimed = await tx.stockAdjustment.updateMany({
          where: { id, businessId, status: existing.status },
          data: {
            status: 'REJECTED',
            rejectedBy: userId,
            rejectedAt,
            rejectionReason: reason.trim(),
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Stock adjustment has already been processed');
        const updated = await tx.stockAdjustment.findFirst({
          where: { id, businessId },
          include: { items: { include: { product: true, location: true } } },
        });
        if (!updated) throw new NotFoundException('Stock adjustment not found');
        await this.audit(
          tx,
          businessId,
          userId,
          'REJECT',
          'StockAdjustment',
          id,
          existing,
          updated,
        );
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async createStockTransfer(businessId: string, userId: string, dto: CreateStockTransferDto) {
    if (dto.fromLocationId === dto.toLocationId)
      throw new BadRequestException('Source and destination locations must differ');
    this.assertUniqueLines(dto.items, (i) => i.productId);
    return this.prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([
        tx.location.findFirst({ where: { id: dto.fromLocationId, businessId, isActive: true } }),
        tx.location.findFirst({ where: { id: dto.toLocationId, businessId, isActive: true } }),
      ]);
      if (!from || !to)
        throw new NotFoundException(
          'Active source or destination location not found in this business',
        );
      const now = new Date();
      const transferNumber = await this.nextNumber(tx, businessId, 'TRF', now);
      const items = [];
      for (const line of dto.items) {
        this.assertFinite(line.quantity, 'quantity');
        if (line.quantity <= 0)
          throw new BadRequestException('Transfer quantities must be greater than zero');
        const product = await tx.product.findFirst({
          where: { id: line.productId, businessId, status: 'ACTIVE' },
        });
        if (!product) throw new NotFoundException(`Active product ${line.productId} not found`);
        items.push({
          productId: product.id,
          quantity: line.quantity,
          unit: line.unit || 'UNIT',
          batchNumber: line.batchNumber,
          notes: line.notes,
        });
      }
      const transfer = await tx.stockTransfer.create({
        data: {
          businessId,
          fromLocationId: from.id,
          toLocationId: to.id,
          transferNumber,
          transferDate: now,
          status: 'DRAFT',
          reason: dto.reason,
          notes: dto.notes,
          createdBy: userId,
          items: { create: items },
        },
        include: { fromLocation: true, toLocation: true, items: { include: { product: true } } },
      });
      await this.audit(
        tx,
        businessId,
        userId,
        'CREATE',
        'StockTransfer',
        transfer.id,
        null,
        transfer,
      );
      return transfer;
    });
  }

  async getStockTransferById(businessId: string, id: string) {
    const result = await this.prisma.stockTransfer.findFirst({
      where: { id, businessId },
      include: { fromLocation: true, toLocation: true, items: { include: { product: true } } },
    });
    if (!result) throw new NotFoundException('Stock transfer not found');
    return result;
  }

  async sendStockTransfer(businessId: string, id: string, userId: string) {
    const result = await this.serializableTransaction(async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id, businessId },
        include: { items: { include: { product: true } } },
      });
      if (!transfer) throw new NotFoundException('Stock transfer not found');
      if (transfer.status !== 'DRAFT')
        throw new ConflictException('Only DRAFT transfers can be sent');
      const balances = new Map<string, number>();
      const sorted = [...transfer.items].sort((a, b) => a.productId.localeCompare(b.productId));
      for (const item of sorted) {
        const balance = await this.lockBalance(tx, item.productId, transfer.fromLocationId);
        if (balance.quantity + EPSILON < item.quantity)
          throw new BadRequestException(`Insufficient stock for ${item.product.name}`);
        balances.set(item.id, balance.quantity);
      }
      const now = new Date();
      for (const item of sorted) {
        await tx.stockBalance.update({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: transfer.fromLocationId,
            },
          },
          data: { quantity: { decrement: item.quantity }, lastMovementAt: now },
        });
        const unitCost = await this.currentUnitCost(
          tx,
          businessId,
          item.productId,
          transfer.fromLocationId,
          item.product.buyingPrice,
        );
        await tx.stockTransferItem.update({ where: { id: item.id }, data: { unitCost } });
        await tx.inventoryMovement.create({
          data: {
            businessId,
            productId: item.productId,
            locationId: transfer.fromLocationId,
            type: 'TRANSFER',
            quantity: -item.quantity,
            referenceId: id,
            referenceType: 'StockTransfer',
            notes: `Sent to ${transfer.toLocationId}`,
            unitCost,
            batchNumber: item.batchNumber,
            createdBy: userId,
          },
        });
      }
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: 'SENT', sentBy: userId, sentDate: now },
        include: { fromLocation: true, toLocation: true, items: { include: { product: true } } },
      });
      await this.audit(tx, businessId, userId, 'SEND', 'StockTransfer', id, transfer, updated);
      return updated;
    });
    await Promise.all(
      result.items.map((item) =>
        this.notifications.checkStockLevel(businessId, item.productId, result.fromLocationId),
      ),
    );
    return result;
  }

  async receiveStockTransfer(
    businessId: string,
    id: string,
    userId: string,
    receivedQuantities?: Record<string, number>,
  ) {
    return this.serializableTransaction(async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id, businessId },
        include: { items: { include: { product: true } } },
      });
      if (!transfer) throw new NotFoundException('Stock transfer not found');
      if (!['SENT', 'PARTIAL'].includes(transfer.status))
        throw new ConflictException('Only SENT or PARTIAL transfers can be received');
      if (receivedQuantities && typeof receivedQuantities !== 'object')
        throw new BadRequestException(
          'receivedQuantities must be an object keyed by transfer item ID',
        );
      const ids = new Set(transfer.items.map((i) => i.id));
      for (const [itemId, qty] of Object.entries(receivedQuantities || {})) {
        if (!ids.has(itemId)) throw new BadRequestException(`Unknown transfer item ${itemId}`);
        this.assertFinite(qty, 'received quantity');
        if (qty < 0) throw new BadRequestException('Received quantities cannot be negative');
      }
      const incoming = transfer.items.map((item) => {
        const remaining = round(item.quantity - item.receivedQuantity);
        const quantity = receivedQuantities ? (receivedQuantities[item.id] ?? 0) : remaining;
        if (quantity > remaining + EPSILON)
          throw new BadRequestException(
            `Received quantity exceeds remaining quantity for ${item.product.name}`,
          );
        return { item, quantity };
      });
      if (!incoming.some((x) => x.quantity > EPSILON))
        throw new BadRequestException('At least one positive received quantity is required');
      const positive = incoming
        .filter((x) => x.quantity > EPSILON)
        .sort((a, b) => a.item.productId.localeCompare(b.item.productId));
      for (const x of positive) await this.lockBalance(tx, x.item.productId, transfer.toLocationId);
      const now = new Date();
      for (const { item, quantity } of positive) {
        await tx.stockBalance.update({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: transfer.toLocationId,
            },
          },
          data: { quantity: { increment: quantity }, lastMovementAt: now },
        });
        await tx.stockTransferItem.update({
          where: { id: item.id },
          data: { receivedQuantity: { increment: quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            businessId,
            productId: item.productId,
            locationId: transfer.toLocationId,
            type: 'TRANSFER',
            quantity,
            referenceId: id,
            referenceType: 'StockTransfer',
            notes: `Received from ${transfer.fromLocationId}`,
            unitCost: item.unitCost ?? item.product.buyingPrice,
            batchNumber: item.batchNumber,
            createdBy: userId,
          },
        });
      }
      const latestItems = await tx.stockTransferItem.findMany({ where: { transferId: id } });
      const complete = latestItems.every((i) => i.receivedQuantity + EPSILON >= i.quantity);
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: complete ? 'COMPLETED' : 'PARTIAL',
          receivedBy: userId,
          receivedDate: now,
        },
        include: { fromLocation: true, toLocation: true, items: { include: { product: true } } },
      });
      await this.audit(tx, businessId, userId, 'RECEIVE', 'StockTransfer', id, transfer, updated);
      return updated;
    });
  }

  async createPhysicalCount(businessId: string, userId: string, dto: CreatePhysicalCountDto) {
    this.assertUniqueLines(dto.items, (i) => i.productId);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({
        where: { id: dto.locationId, businessId, isActive: true },
      });
      if (!location) throw new NotFoundException('Active location not found');
      const now = new Date();
      const countNumber = await this.nextNumber(tx, businessId, 'CNT', now);
      const items = [];
      for (const line of dto.items) {
        this.assertFinite(line.countedQuantity, 'countedQuantity');
        if (line.countedQuantity < 0)
          throw new BadRequestException('Counted quantity cannot be negative');
        const product = await tx.product.findFirst({
          where: { id: line.productId, businessId, status: 'ACTIVE' },
        });
        if (!product) throw new NotFoundException(`Active product ${line.productId} not found`);
        const stock = await tx.stockBalance.findUnique({
          where: { productId_locationId: { productId: line.productId, locationId: location.id } },
        });
        const systemQuantity = round(stock?.quantity || 0);
        const variance = round(line.countedQuantity - systemQuantity);
        items.push({
          productId: product.id,
          systemQuantity,
          countedQuantity: line.countedQuantity,
          variance,
          batchNumber: line.batchNumber,
          notes: line.notes,
        });
      }
      const count = await tx.physicalCount.create({
        data: {
          businessId,
          locationId: location.id,
          countNumber,
          status: 'DRAFT',
          createdBy: userId,
          notes: dto.notes,
          items: { create: items },
        },
        include: { location: true, items: { include: { product: true } } },
      });
      await this.audit(tx, businessId, userId, 'CREATE', 'PhysicalCount', count.id, null, count);
      return count;
    });
  }

  async getPhysicalCountById(businessId: string, id: string) {
    const result = await this.prisma.physicalCount.findFirst({
      where: { id, businessId },
      include: { location: true, items: { include: { product: true } } },
    });
    if (!result) throw new NotFoundException('Physical count not found');
    return result;
  }

  async completePhysicalCount(businessId: string, id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.physicalCount.findFirst({
        where: { id, businessId },
        include: { items: true },
      });
      if (!count) throw new NotFoundException('Physical count not found');
      if (count.status !== 'DRAFT')
        throw new ConflictException('Only DRAFT physical counts can be completed');
      const varianceCount = count.items.filter((i) => Math.abs(i.variance) > EPSILON).length;
      const products = await tx.product.findMany({
        where: { id: { in: count.items.map((i) => i.productId) } },
        select: { id: true, buyingPrice: true },
      });
      const cost = new Map(products.map((p) => [p.id, p.buyingPrice]));
      const totalVarianceAmount = round(
        count.items.reduce(
          (sum, i) => sum + Math.abs(i.variance) * (cost.get(i.productId) || 0),
          0,
        ),
      );
      const updated = await tx.physicalCount.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          varianceCount,
          totalVarianceAmount,
          completedDate: new Date(),
          completedBy: userId,
        },
        include: { location: true, items: { include: { product: true } } },
      });
      await this.audit(tx, businessId, userId, 'COMPLETE', 'PhysicalCount', id, count, updated);
      return updated;
    });
  }

  async postPhysicalCount(businessId: string, id: string, userId: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const count = await tx.physicalCount.findFirst({
          where: { id, businessId },
          include: { items: { include: { product: true } } },
        });
        if (!count) throw new NotFoundException('Physical count not found');
        if (count.status !== 'COMPLETED')
          throw new ConflictException('Only COMPLETED physical counts can be posted');
        const business = await tx.business.findUnique({
          where: { id: businessId },
          select: { allowNegativeStock: true },
        });
        const items = [...count.items].sort((a, b) => a.productId.localeCompare(b.productId));
        for (const item of items) {
          const balance = await this.lockBalance(tx, item.productId, count.locationId);
          if (Math.abs(balance.quantity - item.systemQuantity) > EPSILON) {
            throw new ConflictException(
              `Stock for ${item.product.name} changed since the count snapshot; create a fresh count`,
            );
          }
          const quantity = round(item.countedQuantity - balance.quantity);
          if (!business?.allowNegativeStock && item.countedQuantity < -EPSILON)
            throw new BadRequestException('Count cannot post negative stock');
          if (Math.abs(quantity) <= EPSILON) continue;
          await tx.stockBalance.update({
            where: {
              productId_locationId: { productId: item.productId, locationId: count.locationId },
            },
            data: { quantity: item.countedQuantity, lastMovementAt: new Date() },
          });
          await tx.inventoryMovement.create({
            data: {
              businessId,
              productId: item.productId,
              locationId: count.locationId,
              type: 'ADJUSTMENT',
              quantity,
              referenceId: id,
              referenceType: 'PhysicalCount',
              notes: item.notes || `Physical count ${count.countNumber}`,
              unitCost: item.product.buyingPrice,
              batchNumber: item.batchNumber,
              createdBy: userId,
            },
          });
        }
        const updated = await tx.physicalCount.update({
          where: { id },
          data: { status: 'POSTED', postedDate: new Date(), postedBy: userId },
          include: { location: true, items: { include: { product: true } } },
        });
        await this.audit(tx, businessId, userId, 'POST', 'PhysicalCount', id, count, updated);
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await Promise.all(
      result.items
        .filter((item) => item.variance < -EPSILON)
        .map((item) =>
          this.notifications.checkStockLevel(businessId, item.productId, result.locationId),
        ),
    );
    return result;
  }

  async getStockValuationReport(businessId: string, filter: StockValuationReportDto) {
    const { page, limit, skip } = this.pagination(filter);
    const products = await this.prisma.product.findMany({
      where: { businessId, ...(filter.productId ? { id: filter.productId } : {}) },
      include: {
        stocks: {
          where: {
            location: { businessId },
            ...(filter.locationId ? { locationId: filter.locationId } : {}),
          },
          include: { location: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    const method =
      filter.valuationMethod ||
      (
        await this.prisma.business.findUnique({
          where: { id: businessId },
          select: { costingMethod: true },
        })
      )?.costingMethod ||
      'WEIGHTED_AVERAGE';
    if (!['FIFO', 'LIFO', 'WEIGHTED_AVERAGE'].includes(method))
      throw new BadRequestException('Unsupported valuation method');
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        product: { businessId },
        location: { businessId },
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.locationId ? { locationId: filter.locationId } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true, buyingPrice: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const netMovementByKey = new Map<string, number>();
    for (const movement of movements) {
      const key = `${movement.productId}:${movement.locationId}`;
      netMovementByKey.set(key, (netMovementByKey.get(key) || 0) + movement.quantity);
    }
    const openingLayers = products.flatMap((product) =>
      product.stocks.flatMap((stock) => {
        const key = `${product.id}:${stock.locationId}`;
        const openingQuantity = round(stock.quantity - (netMovementByKey.get(key) || 0));
        if (openingQuantity <= EPSILON) return [];
        return [
          {
            productId: product.id,
            locationId: stock.locationId,
            productName: product.name,
            sku: product.sku,
            locationName: stock.location.name,
            quantity: openingQuantity,
            unitCost: product.buyingPrice,
            batchNumber: null,
            expiryDate: null,
            receivedAt: product.createdAt,
            untracked: true,
          },
        ];
      }),
    );
    const layers = this.replayLayers(movements, method, openingLayers);
    const valueByKey = new Map<string, { qty: number; value: number; lots: MovementLayer[] }>();
    for (const layer of layers) {
      const key = `${layer.productId}:${layer.locationId}`;
      const entry = valueByKey.get(key) || { qty: 0, value: 0, lots: [] };
      entry.qty += layer.quantity;
      entry.value += layer.quantity * layer.unitCost;
      entry.lots.push(layer);
      valueByKey.set(key, entry);
    }
    const result = products.flatMap((product) =>
      product.stocks.map((stock) => {
        const val = valueByKey.get(`${product.id}:${stock.locationId}`);
        const quantity = round(stock.quantity);
        const totalValue = round(
          (val?.value || 0) + (quantity - (val?.qty || 0)) * product.buyingPrice,
        );
        return {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          locationId: stock.locationId,
          locationName: stock.location.name,
          quantity,
          averageUnitCost: quantity ? round(totalValue / quantity) : 0,
          totalValue,
          costingMethod: method,
        };
      }),
    );
    const total = result.length;
    const data = result.slice(skip, skip + limit);
    return {
      data,
      total,
      page,
      limit,
      totalValue: round(result.reduce((s, r) => s + r.totalValue, 0)),
      costingMethod: method,
    };
  }

  async getLowStockReport(businessId: string, filter: LowStockReportDto) {
    const { page, limit, skip } = this.pagination(filter);
    const [products, locations] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          businessId,
          status: 'ACTIVE',
          ...(filter.productId ? { id: filter.productId } : {}),
        },
        include: {
          stocks: { where: filter.locationId ? { locationId: filter.locationId } : undefined },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.location.findMany({
        where: {
          businessId,
          isActive: true,
          ...(filter.locationId ? { id: filter.locationId } : {}),
        },
        select: { id: true, name: true },
      }),
    ]);
    const usageSince = new Date(Date.now() - 30 * 86400000);
    const usage = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'locationId'],
      where: {
        businessId,
        type: 'SALE',
        product: { businessId },
        location: { businessId },
        createdAt: { gte: usageSince },
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.locationId ? { locationId: filter.locationId } : {}),
      },
      _sum: { quantity: true },
    });
    const usageMap = new Map(
      usage.map((u) => [`${u.productId}:${u.locationId}`, Math.max(0, -(u._sum.quantity || 0))]),
    );
    const rows = products.flatMap((p) =>
      locations
        .map((location) => {
          const qty = round(p.stocks.find((s) => s.locationId === location.id)?.quantity || 0);
          const belowMinimum = qty <= p.minimumStock;
          const reorder = qty <= p.reorderLevel;
          const include =
            filter.type === 'BELOW_MINIMUM'
              ? belowMinimum
              : filter.type === 'REORDER'
                ? reorder
                : belowMinimum || reorder;
          const dailyUse = (usageMap.get(`${p.id}:${location.id}`) || 0) / 30;
          return include
            ? {
                productId: p.id,
                sku: p.sku,
                productName: p.name,
                locationId: location.id,
                locationName: location.name,
                quantity: qty,
                minimumStock: p.minimumStock,
                reorderLevel: p.reorderLevel,
                belowMinimum,
                atOrBelowReorderLevel: reorder,
                daysToStockout: dailyUse > 0 ? round(qty / dailyUse) : null,
              }
            : null;
        })
        .filter(Boolean),
    );
    const total = rows.length;
    return { data: rows.slice(skip, skip + limit), total, page, limit };
  }

  async getStockExpiryReport(businessId: string, filter: ExpiryReportDto) {
    const { page, limit, skip } = this.pagination(filter);
    const asOf = filter.asOfDate ? new Date(filter.asOfDate) : new Date();
    const cutoffDays =
      filter.status === 'EXPIRING_7_DAYS'
        ? 7
        : filter.status === 'EXPIRING_30_DAYS'
          ? 30
          : filter.status === 'EXPIRING_90_DAYS'
            ? 90
            : undefined;
    const layers = await this.getCurrentLayers(businessId, filter.productId, filter.locationId);
    const untracked = await this.getUntrackedQuantity(
      businessId,
      layers,
      filter.productId,
      filter.locationId,
      true,
    );
    const rows = layers
      .filter((x) => !x.untracked && x.quantity > EPSILON && x.expiryDate)
      .map((x) => {
        const expiry = x.expiryDate!;
        const daysUntilExpiry = Math.floor((expiry.getTime() - asOf.getTime()) / 86400000);
        return {
          ...x,
          quantity: round(x.quantity),
          expiryDate: expiry,
          daysUntilExpiry,
          status: daysUntilExpiry < 0 ? 'EXPIRED' : 'EXPIRING',
        };
      })
      .filter((x) => {
        if (!filter.status || filter.status === 'ALL') return true;
        if (filter.status === 'EXPIRED') return x.daysUntilExpiry < 0;
        return x.daysUntilExpiry >= 0 && x.daysUntilExpiry <= (cutoffDays ?? 30);
      })
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
    return {
      data: rows.slice(skip, skip + limit),
      total: rows.length,
      page,
      limit,
      asOfDate: asOf,
      untrackedExpiryQuantity: untracked.quantity,
      untrackedExpiryBalances: untracked.balances,
    };
  }

  async getStockAgeingReport(businessId: string, filter: StockAgeingReportDto) {
    const { page, limit, skip } = this.pagination(filter);
    const asOf = filter.asOfDate ? new Date(filter.asOfDate) : new Date();
    const layers = await this.getCurrentLayers(businessId, filter.productId, filter.locationId);
    const untracked = await this.getUntrackedQuantity(
      businessId,
      layers,
      filter.productId,
      filter.locationId,
      false,
    );
    const rows = layers
      .filter((x) => !x.untracked && x.quantity > EPSILON)
      .map((x) => {
        const ageDays = Math.max(
          0,
          Math.floor((asOf.getTime() - x.receivedAt.getTime()) / 86400000),
        );
        const bucket =
          ageDays <= 30
            ? '0-30'
            : ageDays <= 60
              ? '31-60'
              : ageDays <= 90
                ? '61-90'
                : ageDays <= 180
                  ? '91-180'
                  : '180+';
        return {
          ...x,
          quantity: round(x.quantity),
          ageDays,
          bucket,
          value: round(x.quantity * x.unitCost),
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays);
    return {
      data: rows.slice(skip, skip + limit),
      total: rows.length,
      page,
      limit,
      asOfDate: asOf,
      totalValue: round(rows.reduce((s, x) => s + x.value, 0)),
      untrackedStockQuantity: untracked.quantity,
      untrackedBalances: untracked.balances,
    };
  }

  async getInventoryMovementReport(businessId: string, filter: InventoryMovementReportDto) {
    const { page, limit, skip } = this.pagination(filter);
    const sortBy = filter.sortBy || 'createdAt';
    const sortOrder = filter.sortOrder || 'desc';
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        product: { businessId },
        location: { businessId },
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.locationId ? { locationId: filter.locationId } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.referenceId ? { referenceId: filter.referenceId } : {}),
        ...(filter.dateFrom || filter.dateTo
          ? {
              createdAt: {
                ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
                ...(filter.dateTo ? { lte: this.endOfDate(filter.dateTo) } : {}),
              },
            }
          : {}),
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    });
    const total = await this.prisma.inventoryMovement.count({
      where: {
        businessId,
        product: { businessId },
        location: { businessId },
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.locationId ? { locationId: filter.locationId } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.referenceId ? { referenceId: filter.referenceId } : {}),
        ...(filter.dateFrom || filter.dateTo
          ? {
              createdAt: {
                ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
                ...(filter.dateTo ? { lte: this.endOfDate(filter.dateTo) } : {}),
              },
            }
          : {}),
      },
    });
    return { data: rows, total, page, limit };
  }

  async getInventoryDashboard(businessId: string) {
    const [balances, products, movements, pendingAdjustments, pendingTransfers, pendingCounts] =
      await Promise.all([
        this.prisma.stockBalance.findMany({
          where: { product: { businessId }, location: { businessId } },
          include: { product: true, location: true },
        }),
        this.prisma.product.findMany({
          where: { businessId, status: 'ACTIVE' },
          select: { id: true, minimumStock: true, reorderLevel: true },
        }),
        this.prisma.inventoryMovement.findMany({
          where: { businessId, product: { businessId }, location: { businessId } },
          include: {
            product: { select: { id: true, name: true, sku: true } },
            location: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.stockAdjustment.count({
          where: { businessId, status: { in: ['PENDING', 'DRAFT'] } },
        }),
        this.prisma.stockTransfer.count({
          where: { businessId, status: { in: ['DRAFT', 'SENT', 'PARTIAL'] } },
        }),
        this.prisma.physicalCount.count({
          where: { businessId, status: { in: ['DRAFT', 'COMPLETED'] } },
        }),
      ]);
    const activeLocations = await this.prisma.location.findMany({
      where: { businessId, isActive: true },
      select: { id: true },
    });
    const balanceByKey = new Map(
      balances.map((b) => [`${b.productId}:${b.locationId}`, b.quantity]),
    );
    const lowStock = products.reduce(
      (total, product) =>
        total +
        activeLocations.filter(
          (location) =>
            (balanceByKey.get(`${product.id}:${location.id}`) || 0) <= product.reorderLevel,
        ).length,
      0,
    );
    const valuation = await this.getStockValuationReport(businessId, {
      page: 1,
      limit: 100,
    } as StockValuationReportDto);
    const expiry = await this.getStockExpiryReport(businessId, {
      page: 1,
      limit: 100,
      status: 'EXPIRED',
    } as ExpiryReportDto);
    const soon = await this.getStockExpiryReport(businessId, {
      page: 1,
      limit: 100,
      status: 'EXPIRING_30_DAYS',
    } as ExpiryReportDto);
    return {
      totalProducts: products.length,
      totalLocations: activeLocations.length,
      totalStockUnits: round(balances.reduce((s, b) => s + b.quantity, 0)),
      totalStockValue: valuation.totalValue,
      lowStockBalances: lowStock,
      expiredBatchCount: expiry.total,
      expiringWithin30Days: soon.total,
      pendingAdjustments,
      pendingTransfers,
      pendingCounts,
      recentMovements: movements,
    };
  }

  private async nextNumber(
    tx: Tx,
    businessId: string,
    prefix: string,
    date: Date,
  ): Promise<string> {
    const month = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const stem = `${prefix}-${month}-`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${businessId}:${stem}`})::bigint) IS NULL AS locked`;
    const model =
      prefix === 'ADJ'
        ? tx.stockAdjustment
        : prefix === 'TRF'
          ? tx.stockTransfer
          : tx.physicalCount;
    const rows: { number: string }[] = await (model as any).findMany({
      where: {
        businessId,
        [prefix === 'ADJ'
          ? 'adjustmentNumber'
          : prefix === 'TRF'
            ? 'transferNumber'
            : 'countNumber']: { startsWith: stem },
      },
      select: {
        [prefix === 'ADJ'
          ? 'adjustmentNumber'
          : prefix === 'TRF'
            ? 'transferNumber'
            : 'countNumber']: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const field =
      prefix === 'ADJ' ? 'adjustmentNumber' : prefix === 'TRF' ? 'transferNumber' : 'countNumber';
    const currentMax = rows.reduce(
      (max, row) => Math.max(max, Number((row as any)[field]?.slice(stem.length)) || 0),
      0,
    );
    return `${stem}${String(currentMax + 1).padStart(5, '0')}`;
  }

  private async lockBalance(tx: Tx, productId: string, locationId: string) {
    await tx.stockBalance.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: { productId, locationId, quantity: 0 },
      update: {},
    });
    const rows = await tx.$queryRaw<
      { quantity: number }[]
    >`SELECT "quantity" FROM "StockBalance" WHERE "productId" = ${productId} AND "locationId" = ${locationId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Stock balance could not be locked');
    return rows[0];
  }

  private async currentUnitCost(
    tx: Tx,
    businessId: string,
    productId: string,
    locationId: string,
    fallback: number,
  ) {
    const movements = await tx.inventoryMovement.findMany({
      where: { businessId, productId, locationId },
      orderBy: { createdAt: 'asc' },
      select: { quantity: true, unitCost: true, type: true },
    });
    let quantity = 0;
    let value = 0;
    for (const m of movements) {
      if (m.quantity > 0) {
        quantity += m.quantity;
        value += m.quantity * (m.unitCost ?? fallback);
      } else if (m.quantity < 0 && quantity > 0) {
        const used = Math.min(quantity, -m.quantity);
        const avg = value / quantity;
        quantity -= used;
        value -= used * avg;
      }
    }
    return quantity > EPSILON ? round(value / quantity) : fallback;
  }

  async outgoingUnitCost(
    tx: Tx,
    businessId: string,
    productId: string,
    locationId: string,
    quantityToIssue: number,
    availableQuantity: number,
    fallback: number,
  ) {
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: { costingMethod: true },
    });
    const method = business?.costingMethod || 'WEIGHTED_AVERAGE';
    if (!['FIFO', 'LIFO', 'WEIGHTED_AVERAGE'].includes(method))
      throw new BadRequestException('Unsupported valuation method');
    const movements = await tx.inventoryMovement.findMany({
      where: { businessId, productId, locationId },
      select: { id: true, quantity: true, unitCost: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const movementQuantity = movements.reduce((sum, movement) => sum + movement.quantity, 0);
    const openingQuantity = Math.max(0, availableQuantity - movementQuantity);
    const layers: Array<{ quantity: number; unitCost: number }> =
      openingQuantity > EPSILON ? [{ quantity: openingQuantity, unitCost: fallback }] : [];
    let shortage = 0;
    for (const movement of movements) {
      if (movement.quantity > EPSILON) {
        const replenished = Math.min(shortage, movement.quantity);
        shortage = round(shortage - replenished);
        const quantity = round(movement.quantity - replenished);
        if (quantity > EPSILON) layers.push({ quantity, unitCost: movement.unitCost ?? fallback });
        if (method === 'WEIGHTED_AVERAGE') {
          const totalQuantity = layers.reduce((sum, layer) => sum + layer.quantity, 0);
          const totalValue = layers.reduce(
            (sum, layer) => sum + layer.quantity * layer.unitCost,
            0,
          );
          if (totalQuantity > EPSILON) {
            layers.splice(0, layers.length, {
              quantity: totalQuantity,
              unitCost: totalValue / totalQuantity,
            });
          }
        }
      } else if (movement.quantity < -EPSILON) {
        let remaining = -movement.quantity;
        const indexes = method === 'LIFO' ? [...layers.keys()].reverse() : [...layers.keys()];
        for (const index of indexes) {
          if (remaining <= EPSILON) break;
          const used = Math.min(layers[index].quantity, remaining);
          layers[index].quantity = round(layers[index].quantity - used);
          remaining = round(remaining - used);
        }
        for (let index = layers.length - 1; index >= 0; index--)
          if (layers[index].quantity <= EPSILON) layers.splice(index, 1);
        if (remaining > EPSILON) shortage = round(shortage + remaining);
      }
    }

    const trackedQuantity = layers.reduce((sum, layer) => sum + layer.quantity, 0);
    const untrackedQuantity = Math.max(0, availableQuantity - trackedQuantity);
    if (untrackedQuantity > EPSILON)
      layers.push({ quantity: untrackedQuantity, unitCost: fallback });
    let remainingToIssue = quantityToIssue;
    let totalCost = 0;
    const indexes = method === 'LIFO' ? [...layers.keys()].reverse() : [...layers.keys()];
    for (const index of indexes) {
      if (remainingToIssue <= EPSILON) break;
      const used = Math.min(layers[index].quantity, remainingToIssue);
      totalCost += used * layers[index].unitCost;
      remainingToIssue = round(remainingToIssue - used);
    }
    if (remainingToIssue > EPSILON) totalCost += remainingToIssue * fallback;
    return round(totalCost / quantityToIssue);
  }

  private async getCurrentLayers(businessId: string, productId?: string, locationId?: string) {
    const productWhere = { businessId, ...(productId ? { id: productId } : {}) };
    const locationWhere = { businessId, ...(locationId ? { id: locationId } : {}) };
    const [movements, balances] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where: { businessId, product: productWhere, location: locationWhere },
        include: {
          product: { select: { id: true, name: true, sku: true, buyingPrice: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.stockBalance.findMany({
        where: { product: productWhere, location: locationWhere },
        include: {
          product: {
            select: { id: true, name: true, sku: true, buyingPrice: true, createdAt: true },
          },
          location: { select: { id: true, name: true } },
        },
      }),
    ]);
    const netMovementByKey = new Map<string, number>();
    for (const movement of movements) {
      const key = `${movement.productId}:${movement.locationId}`;
      netMovementByKey.set(key, (netMovementByKey.get(key) || 0) + movement.quantity);
    }
    const openingLayers = balances.flatMap((balance) => {
      const key = `${balance.productId}:${balance.locationId}`;
      const openingQuantity = round(balance.quantity - (netMovementByKey.get(key) || 0));
      if (openingQuantity <= EPSILON) return [];
      return [
        {
          productId: balance.productId,
          locationId: balance.locationId,
          productName: balance.product.name,
          sku: balance.product.sku,
          locationName: balance.location.name,
          quantity: openingQuantity,
          unitCost: balance.product.buyingPrice,
          batchNumber: null,
          expiryDate: null,
          receivedAt: balance.product.createdAt,
          untracked: true,
        },
      ];
    });
    return this.replayLayers(movements, 'FIFO', openingLayers);
  }

  private async getUntrackedQuantity(
    businessId: string,
    layers: MovementLayer[],
    productId?: string,
    locationId?: string,
    expiryOnly = false,
  ) {
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        product: { businessId },
        location: { businessId },
        ...(productId ? { productId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      select: { productId: true, locationId: true, quantity: true },
    });
    const tracked = new Map<string, number>();
    for (const layer of layers) {
      if (!expiryOnly && layer.untracked) continue;
      if (expiryOnly && !layer.expiryDate) continue;
      const key = `${layer.productId}:${layer.locationId}`;
      tracked.set(key, (tracked.get(key) || 0) + layer.quantity);
    }
    const unknown = balances
      .map((balance) => ({
        key: `${balance.productId}:${balance.locationId}`,
        quantity: Math.max(
          0,
          balance.quantity - (tracked.get(`${balance.productId}:${balance.locationId}`) || 0),
        ),
      }))
      .filter((row) => row.quantity > EPSILON);
    return {
      quantity: round(unknown.reduce((sum, row) => sum + row.quantity, 0)),
      balances: unknown.length,
    };
  }

  private replayLayers(
    movements: any[],
    method: string,
    openingLayers: MovementLayer[] = [],
  ): MovementLayer[] {
    const groups = new Map<string, MovementLayer[]>();
    const shortageByKey = new Map<string, number>();
    for (const layer of openingLayers) {
      const key = `${layer.productId}:${layer.locationId}`;
      const lots = groups.get(key) || [];
      lots.push(layer);
      groups.set(key, lots);
    }
    for (const movement of movements) {
      const key = `${movement.productId}:${movement.locationId}`;
      const lots = groups.get(key) || [];
      if (movement.quantity > EPSILON) {
        const shortage = shortageByKey.get(key) || 0;
        const replenished = Math.min(shortage, movement.quantity);
        shortageByKey.set(key, round(shortage - replenished));
        const availableQuantity = round(movement.quantity - replenished);
        if (availableQuantity > EPSILON) {
          lots.push({
            productId: movement.productId,
            locationId: movement.locationId,
            productName: movement.product?.name || '',
            sku: movement.product?.sku || '',
            locationName: movement.location?.name || '',
            quantity: availableQuantity,
            unitCost: movement.unitCost ?? movement.product?.buyingPrice ?? 0,
            batchNumber: movement.batchNumber || null,
            expiryDate: movement.expiryDate || null,
            receivedAt: movement.createdAt,
            untracked: false,
          });
        }
        if (method === 'WEIGHTED_AVERAGE') {
          const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
          const value = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
          const average = quantity > EPSILON ? value / quantity : 0;
          lots.forEach((lot) => {
            lot.unitCost = average;
          });
        }
      } else if (movement.quantity < -EPSILON) {
        let remaining = -movement.quantity;
        const indexes = method === 'LIFO' ? [...lots.keys()].reverse() : [...lots.keys()];
        for (const index of indexes) {
          if (remaining <= EPSILON) break;
          const used = Math.min(lots[index].quantity, remaining);
          lots[index].quantity -= used;
          remaining -= used;
        }
        if (remaining > EPSILON) {
          shortageByKey.set(key, round((shortageByKey.get(key) || 0) + remaining));
        }
      }
      groups.set(
        key,
        lots.filter((l) => l.quantity > EPSILON),
      );
    }
    if (method === 'WEIGHTED_AVERAGE') {
      for (const lots of groups.values()) {
        const qty = lots.reduce((s, l) => s + l.quantity, 0);
        const value = lots.reduce((s, l) => s + l.quantity * l.unitCost, 0);
        const avg = qty ? value / qty : 0;
        lots.forEach((l) => {
          l.unitCost = avg;
        });
      }
    }
    return [...groups.values()].flat();
  }

  private pagination(filter: { page?: number; limit?: number }) {
    const page = Math.max(1, Math.floor(Number(filter.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(filter.limit) || 20)));
    return { page, limit, skip: (page - 1) * limit };
  }

  private endOfDate(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Invalid date filter');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private assertFinite(value: number, label: string) {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new BadRequestException(`${label} must be a finite number`);
  }

  private assertUniqueLines<T>(items: T[], key: (item: T) => string) {
    if (!Array.isArray(items) || items.length === 0)
      throw new BadRequestException('At least one item is required');
    const seen = new Set<string>();
    for (const item of items) {
      const value = key(item);
      if (seen.has(value))
        throw new BadRequestException(
          'Duplicate item lines are not allowed; combine quantities first',
        );
      seen.add(value);
    }
  }

  private async audit(
    tx: Tx,
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
