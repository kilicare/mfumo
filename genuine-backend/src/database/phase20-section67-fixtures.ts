import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BUSINESS_ID = 'cmuq20z4y00002i58gp1prlkz';
const BUSINESS_NAME = 'Genuine Liquor Store';
const OWNER_ID = 'cmuq20zaw00262i58zudpqupp';
const PO_NUMBER = 'PH20-S6.7-EXPIRY-001';
const SKU = 'PH20-S6.7-EXP-20261007';
const NOW = new Date('2026-10-07T12:00:00.000Z');

function assertSafeTarget() {
  const raw = process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'development' || !raw)
    throw new Error('Refusing to seed outside local development.');
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || database !== 'genuine') {
    throw new Error('Refusing to seed: expected local development database genuine.');
  }
}

async function main() {
  assertSafeTarget();
  const [business, owner, existingOrder, existingProduct, supplier, location, category, unit] =
    await Promise.all([
      prisma.business.findUnique({ where: { id: BUSINESS_ID }, select: { id: true, name: true } }),
      prisma.user.findUnique({ where: { id: OWNER_ID }, select: { id: true, businessId: true } }),
      prisma.purchaseOrder.findFirst({
        where: { businessId: BUSINESS_ID, poNumber: PO_NUMBER },
        select: { id: true },
      }),
      prisma.product.findFirst({
        where: { businessId: BUSINESS_ID, sku: SKU },
        select: { id: true },
      }),
      prisma.supplier.findFirst({
        where: { businessId: BUSINESS_ID, supplierCode: 'SUP-00001', isActive: true },
        select: { id: true },
      }),
      prisma.location.findFirst({
        where: { businessId: BUSINESS_ID, code: 'MAIN', isActive: true },
        select: { id: true },
      }),
      prisma.category.findFirst({
        where: { businessId: BUSINESS_ID, name: 'Beverages', isActive: true },
        select: { id: true },
      }),
      prisma.unit.findFirst({
        where: {
          name: 'Bottle',
          isActive: true,
          OR: [{ businessId: BUSINESS_ID }, { businessId: null }],
        },
        select: { id: true },
      }),
    ]);
  if (!business || business.name !== BUSINESS_NAME || !owner || owner.businessId !== BUSINESS_ID)
    throw new Error('Business A/owner safety check failed.');
  if (existingOrder || existingProduct)
    throw new Error('6.7 fixture already exists; refusing to duplicate or reset it.');
  if (!supplier || !location || !category || !unit)
    throw new Error('Required active supplier/location/category/Bottle unit missing.');

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        businessId: BUSINESS_ID,
        sku: SKU,
        name: 'PH20 GRN Expiry Gate Test Product',
        description: 'Synthetic Phase 20 Section 6.7 fixture; do not use for sales.',
        categoryId: category.id,
        supplierId: supplier.id,
        buyingPrice: 100,
        sellingPrice: 150,
        minimumStock: 0,
        reorderLevel: 0,
        defaultUnitId: unit.id,
        status: 'ACTIVE',
        requiresExpiry: true,
      },
      select: { id: true, sku: true, name: true, requiresExpiry: true },
    });
    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        businessId: BUSINESS_ID,
        poNumber: PO_NUMBER,
        supplierId: supplier.id,
        locationId: location.id,
        status: 'ORDERED',
        subtotal: 300,
        totalAmount: 300,
        orderDate: NOW,
        expectedDeliveryDate: new Date('2026-10-14T12:00:00.000Z'),
        approvedBy: OWNER_ID,
        approvedAt: NOW,
        createdBy: OWNER_ID,
        referenceNumber: PO_NUMBER,
        notes:
          'Synthetic 6.7 expiry policy fixture. Accepted quantity needs a batch and expiry after received date; rejected/damaged units do not enter stock.',
        items: {
          create: [
            { productId: product.id, quantity: 3, unitPrice: 100, discount: 0, lineTotal: 300 },
          ],
        },
      },
      include: { items: { select: { id: true, productId: true, quantity: true } } },
    });
    return { product, purchaseOrder };
  });
  console.log(JSON.stringify({ business: BUSINESS_NAME, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
