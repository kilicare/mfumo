import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PurchaseService } from '../purchases/purchase.service';
import type { PrismaService } from './prisma.service';

const prisma = new PrismaClient();
const BUSINESS_ID = 'cmuq20z4y00002i58gp1prlkz';
const BUSINESS_NAME = 'Genuine Liquor Store';
const OWNER_ID = 'cmuq20zaw00262i58zudpqupp';
const PREFIX = 'PH20-S6.1-';
const SKU = 'PH20-S6.1-GRN-20261007';
const SECTION_62_PO = 'PH20-S6.2-QUANT-001';
const SECTION_62_SKUS = ['PH20-S6.2-FULL-20261007', 'PH20-S6.2-SPLIT-20261007'] as const;
const NOW = new Date('2026-10-07T12:00:00.000Z');

function assertSafeTarget() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Refusing to seed: NODE_ENV must be development.');
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is missing.');
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || database !== 'genuine') {
    throw new Error('Refusing to seed: expected local development database genuine.');
  }
}

async function report() {
  const orders = await prisma.purchaseOrder.findMany({
    where: { businessId: BUSINESS_ID, poNumber: { startsWith: PREFIX } },
    include: {
      items: { select: { id: true, quantity: true, product: { select: { id: true, sku: true, name: true } } } },
      grns: { include: { items: true } },
    },
    orderBy: { poNumber: 'asc' },
  });
  const section62Order = await prisma.purchaseOrder.findFirst({
    where: { businessId: BUSINESS_ID, poNumber: SECTION_62_PO },
    include: { items: { include: { product: { select: { id: true, sku: true, name: true, stocks: { select: { locationId: true, quantity: true } } } } } }, grns: true },
  });
  const product = await prisma.product.findFirst({ where: { businessId: BUSINESS_ID, sku: SKU }, select: { id: true, sku: true, name: true, stocks: { select: { locationId: true, quantity: true } } } });
  const movements = product ? await prisma.inventoryMovement.findMany({ where: { businessId: BUSINESS_ID, productId: product.id, referenceType: 'GoodsReceivedNote' }, select: { id: true, type: true, quantity: true, referenceId: true } }) : [];
  console.log(JSON.stringify({
    business: BUSINESS_NAME,
    fixtures: orders.map((order) => ({
      poNumber: order.poNumber,
      id: order.id,
      status: order.status,
      itemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      grns: order.grns.map((grn) => ({ grnNumber: grn.grnNumber, status: grn.status, received: grn.items.reduce((sum, item) => sum + item.receivedQuantity, 0), accepted: grn.items.reduce((sum, item) => sum + item.acceptedQuantity, 0) })),
    })),
    dedicatedFixtureProduct: product,
    fixtureInventoryMovements: movements,
    section62Fixture: section62Order ? {
      poNumber: section62Order.poNumber,
      status: section62Order.status,
      items: section62Order.items.map((item) => ({ sku: item.product.sku, name: item.product.name, ordered: item.quantity, stocks: item.product.stocks })),
      grns: section62Order.grns.map((grn) => ({ grnNumber: grn.grnNumber, status: grn.status })),
    } : null,
  }, null, 2));
}

async function verifyRejectedStateGates() {
  const purchaseService = new PurchaseService(
    new Proxy(prisma, {
      get(target, property) {
        if (property === '$transaction') {
          return () => { throw new Error('Unexpected transaction: read-only gate verification aborted.'); };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as unknown as PrismaService,
    { log: () => undefined } as never,
    null as never,
  );
  const orders = await prisma.purchaseOrder.findMany({
    where: { businessId: BUSINESS_ID, poNumber: { in: [
      `${PREFIX}DRAFT-001`, `${PREFIX}FULL-001`, `${PREFIX}CANCEL-001`,
    ] } },
    select: { id: true, poNumber: true, status: true },
    orderBy: { poNumber: 'asc' },
  });
  if (orders.length !== 3) throw new Error('Expected all three guarded state fixtures; no calls made.');

  const results = [];
  for (const order of orders) {
    try {
      await purchaseService.createGRN(BUSINESS_ID, OWNER_ID, {
        purchaseOrderId: order.id,
        items: [],
      } as never);
      results.push({ poNumber: order.poNumber, status: order.status, passed: false, result: 'Unexpectedly allowed' });
    } catch (error) {
      const rejected = error instanceof BadRequestException && error.getStatus() === 400;
      results.push({
        poNumber: order.poNumber,
        status: order.status,
        passed: rejected,
        result: rejected ? `HTTP ${error.getStatus()} state rejection` : 'Unexpected error or transaction guard triggered',
      });
    }
  }
  console.log(JSON.stringify({ mode: 'read-only service state-gate verification', results }, null, 2));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

async function seedSection62() {
  const [business, owner, existingPo, existingProducts, supplier, location, category, unit] = await Promise.all([
    prisma.business.findUnique({ where: { id: BUSINESS_ID }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: OWNER_ID }, select: { id: true, businessId: true } }),
    prisma.purchaseOrder.findFirst({ where: { businessId: BUSINESS_ID, poNumber: SECTION_62_PO }, select: { id: true } }),
    prisma.product.findMany({ where: { businessId: BUSINESS_ID, sku: { in: [...SECTION_62_SKUS] } }, select: { id: true, sku: true } }),
    prisma.supplier.findFirst({ where: { businessId: BUSINESS_ID, supplierCode: 'SUP-00001', isActive: true }, select: { id: true } }),
    prisma.location.findFirst({ where: { businessId: BUSINESS_ID, code: 'MAIN', isActive: true }, select: { id: true } }),
    prisma.category.findFirst({ where: { businessId: BUSINESS_ID, name: 'Beverages', isActive: true }, select: { id: true } }),
    prisma.unit.findFirst({ where: { name: 'Bottle', isActive: true, OR: [{ businessId: BUSINESS_ID }, { businessId: null }] }, select: { id: true } }),
  ]);
  if (!business || business.name !== BUSINESS_NAME || !owner || owner.businessId !== BUSINESS_ID) throw new Error('Business A/owner safety check failed; no records written.');
  if (existingPo || existingProducts.length) throw new Error('Section 6.2 fixture already exists; refusing to duplicate or reset it.');
  if (!supplier || !location || !category || !unit) throw new Error('Business A active supplier/location/category/Bottle unit missing; no records written.');

  const result = await prisma.$transaction(async (tx) => {
    const [fullProduct, splitProduct] = await Promise.all(SECTION_62_SKUS.map((sku, index) => tx.product.create({
      data: {
        businessId: BUSINESS_ID,
        sku,
        name: index === 0 ? 'PH20 GRN Fully Accepted Line' : 'PH20 GRN Split Quantity Line',
        description: 'Synthetic Phase 20 Section 6.2 fixture; do not use for sales.',
        categoryId: category.id,
        supplierId: supplier.id,
        buyingPrice: 100,
        sellingPrice: 150,
        minimumStock: 0,
        reorderLevel: 0,
        defaultUnitId: unit.id,
        status: 'ACTIVE',
      },
      select: { id: true, sku: true, name: true },
    })));
    const po = await tx.purchaseOrder.create({
      data: {
        businessId: BUSINESS_ID,
        poNumber: SECTION_62_PO,
        supplierId: supplier.id,
        locationId: location.id,
        status: 'ORDERED',
        subtotal: 500,
        totalAmount: 500,
        orderDate: NOW,
        expectedDeliveryDate: new Date('2026-10-14T12:00:00.000Z'),
        createdBy: OWNER_ID,
        approvedBy: OWNER_ID,
        approvedAt: NOW,
        referenceNumber: SECTION_62_PO,
        notes: 'Synthetic 6.2 quantity equation fixture; two distinct products, no receipt/stock effects yet.',
        items: { create: [
          { productId: fullProduct.id, quantity: 2, unitPrice: 100, discount: 0, lineTotal: 200 },
          { productId: splitProduct.id, quantity: 3, unitPrice: 100, discount: 0, lineTotal: 300 },
        ] },
      },
      include: { items: { select: { id: true, productId: true, quantity: true } } },
    });
    return { po, products: [fullProduct, splitProduct] };
  });
  console.log(JSON.stringify({ business: BUSINESS_NAME, purchaseOrder: result.po, products: result.products }, null, 2));
}

async function seed() {
  assertSafeTarget();
  const [business, owner, existingOrders, existingProduct] = await Promise.all([
    prisma.business.findUnique({ where: { id: BUSINESS_ID }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: OWNER_ID }, select: { id: true, businessId: true } }),
    prisma.purchaseOrder.count({ where: { businessId: BUSINESS_ID, poNumber: { startsWith: PREFIX } } }),
    prisma.product.findFirst({ where: { businessId: BUSINESS_ID, sku: SKU }, select: { id: true } }),
  ]);
  if (!business || business.name !== BUSINESS_NAME || !owner || owner.businessId !== BUSINESS_ID) throw new Error('Business A/owner safety check failed; no records written.');
  if (existingOrders || existingProduct) throw new Error('Phase 20 Section 6.1 fixtures already exist; refusing to duplicate or reset them. Use --report to inspect.');

  const [supplier, location, category, unit] = await Promise.all([
    prisma.supplier.findFirst({ where: { businessId: BUSINESS_ID, supplierCode: 'SUP-00001', isActive: true }, select: { id: true } }),
    prisma.location.findFirst({ where: { businessId: BUSINESS_ID, code: 'MAIN', isActive: true }, select: { id: true } }),
    prisma.category.findFirst({ where: { businessId: BUSINESS_ID, name: 'Beverages', isActive: true }, select: { id: true } }),
    prisma.unit.findFirst({ where: { name: 'Bottle', isActive: true, OR: [{ businessId: BUSINESS_ID }, { businessId: null }] }, select: { id: true } }),
  ]);
  if (!supplier || !location || !category || !unit) throw new Error('Business A active supplier/location/category/Bottle unit missing; no records written.');

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        businessId: BUSINESS_ID,
        sku: SKU,
        name: 'PH20 GRN Gate Test Product',
        description: 'Synthetic Phase 20 Section 6.1 fixture; do not use for sales.',
        categoryId: category.id,
        supplierId: supplier.id,
        buyingPrice: 100,
        sellingPrice: 150,
        minimumStock: 0,
        reorderLevel: 0,
        defaultUnitId: unit.id,
        status: 'ACTIVE',
      },
    });

    const specs = [
      { suffix: 'DRAFT-001', status: 'DRAFT', quantity: 3, accepted: 0 },
      { suffix: 'ORDERED-001', status: 'ORDERED', quantity: 3, accepted: 0 },
      { suffix: 'PARTIAL-001', status: 'PARTIALLY_RECEIVED', quantity: 3, accepted: 1 },
      { suffix: 'FULL-001', status: 'FULLY_RECEIVED', quantity: 2, accepted: 2 },
      { suffix: 'CANCEL-001', status: 'CANCELLED', quantity: 3, accepted: 0 },
    ] as const;

    for (const spec of specs) {
      const po = await tx.purchaseOrder.create({
        data: {
          businessId: BUSINESS_ID,
          poNumber: `${PREFIX}${spec.suffix}`,
          supplierId: supplier.id,
          locationId: location.id,
          status: spec.status,
          subtotal: spec.quantity * 100,
          totalAmount: spec.quantity * 100,
          orderDate: NOW,
          expectedDeliveryDate: new Date('2026-10-14T12:00:00.000Z'),
          createdBy: OWNER_ID,
          approvedBy: spec.status === 'ORDERED' || spec.status === 'PARTIALLY_RECEIVED' || spec.status === 'FULLY_RECEIVED' ? OWNER_ID : null,
          approvedAt: spec.status === 'ORDERED' || spec.status === 'PARTIALLY_RECEIVED' || spec.status === 'FULLY_RECEIVED' ? NOW : null,
          cancelledBy: spec.status === 'CANCELLED' ? OWNER_ID : null,
          cancelledAt: spec.status === 'CANCELLED' ? NOW : null,
          referenceNumber: `${PREFIX}${spec.suffix}`,
          notes: spec.status === 'CANCELLED'
            ? `${PREFIX}Cancelled fixture for GRN state-gate verification. [CANCELLED: synthetic 6.1 test fixture]`
            : `${PREFIX}Synthetic state fixture for GRN gate checks; no payment or returns.`,
          items: { create: [{ productId: product.id, quantity: spec.quantity, unitPrice: 100, discount: 0, lineTotal: spec.quantity * 100 }] },
        },
        include: { items: true },
      });

      if (spec.accepted > 0) {
        const grn = await tx.goodsReceivedNote.create({
          data: {
            businessId: BUSINESS_ID,
            grnNumber: `${PREFIX}GRN-${spec.suffix}`,
            purchaseOrderId: po.id,
            status: 'ACCEPTED',
            receivedBy: OWNER_ID,
            receivedDate: NOW,
            notes: `${PREFIX}Accepted baseline receipt for consistent ${spec.status} fixture.`,
            items: { create: [{
              purchaseOrderItemId: po.items[0].id,
              receivedQuantity: spec.accepted,
              acceptedQuantity: spec.accepted,
              rejectedQuantity: 0,
              damageQuantity: 0,
            }] },
          },
          include: { items: true },
        });
        await tx.stockBalance.upsert({
          where: { productId_locationId: { productId: product.id, locationId: location.id } },
          create: { productId: product.id, locationId: location.id, quantity: spec.accepted, lastMovementAt: NOW },
          update: { quantity: { increment: spec.accepted }, lastMovementAt: NOW },
        });
        await tx.inventoryMovement.create({
          data: {
            businessId: BUSINESS_ID,
            productId: product.id,
            locationId: location.id,
            type: 'PURCHASE',
            quantity: spec.accepted,
            referenceId: grn.id,
            referenceType: 'GoodsReceivedNote',
            unitCost: 100,
            notes: `${PREFIX}Baseline stock for the ${spec.status} GRN gate fixture.`,
            createdBy: OWNER_ID,
            createdAt: NOW,
          },
        });
      }
    }
  });
  await report();
}

async function main() {
  assertSafeTarget();
  if (process.argv.includes('--report')) await report();
  else if (process.argv.includes('--verify-rejections')) await verifyRejectedStateGates();
  else if (process.argv.includes('--seed-6-2')) await seedSection62();
  else await seed();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Phase 20 Section 6.1 fixture preparation failed.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
