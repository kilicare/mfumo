import 'dotenv/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BUSINESS_A_ID = 'cmuq20z4y00002i58gp1prlkz';
const BUSINESS_A_NAME = 'Genuine Liquor Store';
const BUSINESS_B_ID = '2c0d3166-0534-4f40-a3f3-e2f8537e7b2d';
const FIXTURE_PREFIX = 'PH20-S3-';
const QA_EMAIL = 'ph20-s3-editor@example.test';
const QA_ROLE = 'PH20 Section 3 List Editor';
const OWNER_ID = 'cmuq20zaw00262i58zudpqupp';

function assertSafeTarget(): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Refusing to seed: NODE_ENV must be development.');
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is missing.');
  const url = new URL(raw);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || databaseName !== 'genuine') {
    throw new Error('Refusing to seed: expected the local development database named genuine.');
  }
}

async function main(): Promise<void> {
  assertSafeTarget();

  if (process.argv.includes('--report')) {
    const detail = await prisma.purchaseOrder.findFirst({
      where: { businessId: BUSINESS_A_ID, poNumber: 'PH20-S3-DETAIL-001' },
      include: { supplier: true, location: true, items: { include: { product: true } } },
    });
    const [total, pageOne, pageTwo, suppliers, businessBOrder] = await Promise.all([
      prisma.purchaseOrder.count({ where: { businessId: BUSINESS_A_ID } }),
      prisma.purchaseOrder.count({ where: { businessId: BUSINESS_A_ID }, take: 20 }),
      prisma.purchaseOrder.count({ where: { businessId: BUSINESS_A_ID }, skip: 20 }),
      prisma.supplier.findMany({ where: { businessId: BUSINESS_A_ID, supplierCode: { startsWith: 'PH20-S3-' } }, select: { id: true, name: true, supplierCode: true, isActive: true } }),
      prisma.purchaseOrder.findFirst({ where: { businessId: BUSINESS_B_ID, poNumber: 'PH20-S3-B-ORD-001' }, select: { id: true, businessId: true, poNumber: true, status: true } }),
    ]);
    console.log(JSON.stringify({
      totalBusinessAPurchaseOrders: total,
      defaultPageOne: { expectedRows: pageOne, page: 1, limit: 20 },
      defaultPageTwo: { expectedRows: pageTwo, page: 2, limit: 20 },
      fixtureSuppliers: suppliers,
      detail: detail && {
        id: detail.id, poNumber: detail.poNumber, status: detail.status,
        supplier: { id: detail.supplier.id, name: detail.supplier.name },
        location: { id: detail.location.id, name: detail.location.name },
        subtotal: detail.subtotal, shippingCost: detail.shippingCost, taxAmount: detail.taxAmount, totalAmount: detail.totalAmount,
        items: detail.items.map((item) => ({ id: item.id, productName: item.product.name, productSku: item.product.sku, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
        payments: await prisma.payment.aggregate({ where: { businessId: BUSINESS_A_ID, poId: detail.id, status: { not: 'VOIDED' } }, _sum: { amount: true } }),
        goodsReceivedNotes: await prisma.goodsReceivedNote.count({ where: { businessId: BUSINESS_A_ID, purchaseOrderId: detail.id } }),
        supplierReturns: await prisma.purchaseReturn.count({ where: { businessId: BUSINESS_A_ID, purchaseOrderId: detail.id } }),
      },
      businessBIsolationOrder: businessBOrder,
    }, null, 2));
    return;
  }

  const [businessA, businessB, owner, existingFixtures, existingQa] = await Promise.all([
    prisma.business.findUnique({ where: { id: BUSINESS_A_ID }, select: { id: true, name: true } }),
    prisma.business.findUnique({ where: { id: BUSINESS_B_ID }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: OWNER_ID }, select: { id: true, businessId: true } }),
    prisma.purchaseOrder.count({ where: { poNumber: { startsWith: FIXTURE_PREFIX } } }),
    prisma.user.findUnique({ where: { email: QA_EMAIL }, select: { id: true } }),
  ]);

  if (!businessA || businessA.name !== BUSINESS_A_NAME || !businessB || !owner || owner.businessId !== BUSINESS_A_ID) {
    throw new Error('Business/user safety check failed; no records were written.');
  }
  if (existingFixtures > 0 || existingQa) {
    throw new Error('PH20 Section 3 fixtures or QA user already exist; refusing to duplicate or reset them.');
  }

  const [supplier, product, secondProduct, location, businessBSupplier, businessBProduct, businessBLocation, permissions] =
    await Promise.all([
      prisma.supplier.findFirst({ where: { businessId: BUSINESS_A_ID, supplierCode: 'SUP-00001', isActive: true } }),
      prisma.product.findFirst({ where: { businessId: BUSINESS_A_ID, sku: 'BEV-001', status: 'ACTIVE' } }),
      prisma.product.findFirst({ where: { businessId: BUSINESS_A_ID, sku: 'wtyuiop', status: 'ACTIVE' } }),
      prisma.location.findFirst({ where: { businessId: BUSINESS_A_ID, code: 'MAIN', isActive: true } }),
      prisma.supplier.findFirst({ where: { businessId: BUSINESS_B_ID, supplierCode: 'PH20-B-SUP-001', isActive: true } }),
      prisma.product.findFirst({ where: { businessId: BUSINESS_B_ID, sku: 'PH19-TENANT-B-20261006', status: 'ACTIVE' } }),
      prisma.location.findUnique({ where: { id: 'cmuwctfmb00021b1hx5qaeal2' } }),
      prisma.permission.findMany({ where: { businessId: BUSINESS_A_ID, key: { in: ['purchases.view', 'purchases.edit'] } } }),
    ]);

  if (!supplier || !product || !secondProduct || !location || !businessBSupplier || !businessBProduct || !businessBLocation || businessBLocation.businessId !== BUSINESS_B_ID) {
    throw new Error('Required existing test supplier/product/location for Business A or B is missing; no records were written.');
  }
  if (permissions.length !== 2) {
    throw new Error('Business A must have purchases.view and purchases.edit permission records; no records were written.');
  }

  const alphaSupplierId = 'f8832d0e-6909-424b-8bc7-bf30e09f38be';
  const inactiveSupplierId = '87f364cb-099d-4695-8889-e6b6c90ce519';
  const passphrase = `PH20-S3-${randomBytes(18).toString('base64url')}!`;
  const passwordHash = await bcrypt.hash(passphrase, 12);
  const orderSpecs = [
    { poNumber: 'PH20-S3-DETAIL-001', status: 'DRAFT', date: '2026-03-10T00:00:00.000Z', total: 17625, supplier: 'base', detail: true },
    { poNumber: 'PH20-S3-ORD-002', status: 'ORDERED', date: '2026-03-10T23:59:59.999Z', total: 1500, supplier: 'alpha' },
    { poNumber: 'PH20-S3-ORD-003', status: 'ORDERED', date: '2026-03-11T00:00:00.000Z', total: 3000, supplier: 'base' },
    { poNumber: 'PH20-S3-ORD-004', status: 'ORDERED', date: '2026-03-12T23:59:59.999Z', total: 4500, supplier: 'alpha' },
    { poNumber: 'PH20-S3-PART-005', status: 'PARTIALLY_RECEIVED', date: '2026-03-13T00:00:00.000Z', total: 6000, supplier: 'base' },
    { poNumber: 'PH20-S3-FULL-006', status: 'FULLY_RECEIVED', date: '2026-02-01T00:00:00.000Z', total: 7500, supplier: 'alpha' },
    { poNumber: 'PH20-S3-CLOSED-007', status: 'CLOSED', date: '2026-01-31T23:59:59.999Z', total: 9000, supplier: 'base' },
    { poNumber: 'PH20-S3-CANCEL-008', status: 'CANCELLED', date: '2025-12-31T23:59:59.999Z', total: 10500, supplier: 'inactive' },
    { poNumber: 'PH20-S3-DRAFT-009', status: 'DRAFT', date: '2026-01-01T00:00:00.000Z', total: 12000, supplier: 'base' },
    { poNumber: 'PH20-S3-ORD-010', status: 'ORDERED', date: '2026-06-15T08:00:00.000Z', total: 13500, supplier: 'inactive' },
    { poNumber: 'PH20-S3-ORD-011', status: 'ORDERED', date: '2026-06-15T18:30:00.000Z', total: 15000, supplier: 'alpha' },
    { poNumber: 'PH20-S3-PART-012', status: 'PARTIALLY_RECEIVED', date: '2026-07-01T00:00:00.000Z', total: 16500, supplier: 'base' },
    { poNumber: 'PH20-S3-FULL-013', status: 'FULLY_RECEIVED', date: '2026-07-31T23:59:59.999Z', total: 18000, supplier: 'alpha' },
    { poNumber: 'PH20-S3-CLOSED-014', status: 'CLOSED', date: '2026-08-01T00:00:00.000Z', total: 19500, supplier: 'base' },
    { poNumber: 'PH20-S3-CANCEL-015', status: 'CANCELLED', date: '2026-09-30T23:59:59.999Z', total: 21000, supplier: 'inactive' },
    { poNumber: 'PH20-S3-DRAFT-016', status: 'DRAFT', date: '2026-10-01T00:00:00.000Z', total: 22500, supplier: 'alpha' },
    { poNumber: 'PH20-S3-PART-017', status: 'PARTIALLY_RECEIVED', date: '2026-10-02T23:59:59.999Z', total: 24000, supplier: 'base' },
    { poNumber: 'PH20-S3-FULL-018', status: 'FULLY_RECEIVED', date: '2026-05-01T00:00:00.000Z', total: 25500, supplier: 'alpha' },
    { poNumber: 'PH20-S3-CLOSED-019', status: 'CLOSED', date: '2026-04-30T23:59:59.999Z', total: 27000, supplier: 'base' },
    { poNumber: 'PH20-S3-CANCEL-020', status: 'CANCELLED', date: '2026-04-01T00:00:00.000Z', total: 28500, supplier: 'inactive' },
    { poNumber: 'PH20-S3-DRAFT-021', status: 'DRAFT', date: '2026-02-28T23:59:59.999Z', total: 30000, supplier: 'base' },
    { poNumber: 'PH20-S3-ORD-022', status: 'ORDERED', date: '2026-03-01T00:00:00.000Z', total: 31500, supplier: 'alpha' },
    { poNumber: 'PH20-S3-PART-023', status: 'PARTIALLY_RECEIVED', date: '2026-09-01T00:00:00.000Z', total: 33000, supplier: 'base' },
    { poNumber: 'PH20-S3-FULL-024', status: 'FULLY_RECEIVED', date: '2026-09-29T23:59:59.999Z', total: 34500, supplier: 'alpha' },
    { poNumber: 'PH20-S3-CLOSED-025', status: 'CLOSED', date: '2026-05-31T23:59:59.999Z', total: 36000, supplier: 'base' },
    { poNumber: 'PH20-S3-CANCEL-026', status: 'CANCELLED', date: '2026-06-01T00:00:00.000Z', total: 37500, supplier: 'inactive' },
    { poNumber: 'PH20-S3-DRAFT-027', status: 'DRAFT', date: '2026-08-31T23:59:59.999Z', total: 39000, supplier: 'alpha' },
    { poNumber: 'PH20-S3-PART-028', status: 'PARTIALLY_RECEIVED', date: '2026-01-15T12:00:00.000Z', total: 40500, supplier: 'base' },
    { poNumber: 'PH20-S3-FULL-029', status: 'FULLY_RECEIVED', date: '2026-03-31T23:59:59.999Z', total: 42000, supplier: 'alpha' },
    { poNumber: 'PH20-S3-CLOSED-030', status: 'CLOSED', date: '2026-07-15T12:00:00.000Z', total: 43500, supplier: 'base' },
  ];

  await prisma.$transaction(async (tx) => {
    await tx.supplier.createMany({
      data: [
        { id: alphaSupplierId, businessId: BUSINESS_A_ID, name: 'PH20 S3 Supplier Alpha', supplierCode: 'PH20-S3-SUP-A', email: 'ph20-s3-alpha@example.test', phone: '+255700000301', paymentTerms: 'NET-30', isActive: true },
        { id: inactiveSupplierId, businessId: BUSINESS_A_ID, name: 'PH20 S3 Inactive Supplier', supplierCode: 'PH20-S3-SUP-I', email: 'ph20-s3-inactive@example.test', phone: '+255700000302', paymentTerms: 'CASH', isActive: false },
      ],
    });

    for (const spec of orderSpecs) {
      const supplierId = spec.supplier === 'alpha' ? alphaSupplierId : spec.supplier === 'inactive' ? inactiveSupplierId : supplier.id;
      const isDetail = 'detail' in spec && spec.detail;
      const items = isDetail
        ? [
            { productId: product.id, quantity: 10, unitPrice: 1500, discount: 0, lineTotal: 15000 },
            { productId: secondProduct.id, quantity: 0.25, unitPrice: 6789, discount: 0, lineTotal: 1697.25 },
          ]
        : [{ productId: product.id, quantity: 1, unitPrice: spec.total, discount: 0, lineTotal: spec.total }];
      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const shippingCost = isDetail ? 500 : 0;
      const taxAmount = isDetail ? 429.75 : 0;
      await tx.purchaseOrder.create({
        data: {
          businessId: BUSINESS_A_ID,
          poNumber: spec.poNumber,
          supplierId,
          locationId: location.id,
          status: spec.status,
          subtotal,
          shippingCost,
          taxAmount,
          totalAmount: subtotal + shippingCost + taxAmount,
          orderDate: new Date(spec.date),
          createdAt: new Date(Date.UTC(2026, 9, 3, 0, 0, orderSpecs.indexOf(spec))),
          expectedDeliveryDate: new Date(new Date(spec.date).getTime() + 7 * 86400000),
          createdBy: OWNER_ID,
          approvedBy: spec.status === 'ORDERED' ? OWNER_ID : null,
          approvedAt: spec.status === 'ORDERED' ? new Date(spec.date) : null,
          cancelledBy: spec.status === 'CANCELLED' ? OWNER_ID : null,
          cancelledAt: spec.status === 'CANCELLED' ? new Date(spec.date) : null,
          referenceNumber: `${FIXTURE_PREFIX}REF-${spec.poNumber.slice(-3)}`,
          notes: isDetail
            ? `${FIXTURE_PREFIX}Detail reconciliation fixture; intentionally no GRN, return or payment.`
            : `${FIXTURE_PREFIX}List/filter status fixture only; intentionally no workflow side effects.`,
          items: { create: items },
        },
      });
    }

    await tx.purchaseOrder.create({
      data: {
        businessId: BUSINESS_B_ID,
        poNumber: 'PH20-S3-B-ORD-001',
        supplierId: businessBSupplier.id,
        locationId: businessBLocation.id,
        status: 'DRAFT',
        subtotal: 1000,
        totalAmount: 1000,
        orderDate: new Date('2026-03-10T12:00:00.000Z'),
        createdBy: 'ae399d45-865f-4e57-8091-375f922dde6c',
        notes: `${FIXTURE_PREFIX}Business B tenant isolation fixture.`,
        items: { create: [{ productId: businessBProduct.id, quantity: 1, unitPrice: 1000, discount: 0, lineTotal: 1000 }] },
      },
    });

    await tx.role.create({
      data: {
        businessId: BUSINESS_A_ID,
        name: QA_ROLE,
        description: 'Temporary Phase 20 Section 3 list/detail refresh tester.',
        permissions: { connect: permissions.map(({ id }) => ({ id })) },
        userRoles: {
          create: {
            user: {
              create: {
                businessId: BUSINESS_A_ID,
                email: QA_EMAIL,
                passwordHash,
                firstName: 'PH20 Section 3',
                lastName: 'QA Editor',
                isActive: true,
                isVerified: true,
              },
            },
          },
        },
      },
    });
  });

  console.log(JSON.stringify({
    businessA: BUSINESS_A_NAME,
    fixturesCreated: orderSpecs.length,
    existingBusinessAPurchaseOrders: await prisma.purchaseOrder.count({ where: { businessId: BUSINESS_A_ID } }),
    statuses: await prisma.purchaseOrder.groupBy({ by: ['status'], where: { businessId: BUSINESS_A_ID, poNumber: { startsWith: FIXTURE_PREFIX } }, _count: { status: true }, orderBy: { status: 'asc' } }),
    suppliers: ['Test Supplier Ltd (active)', 'PH20 S3 Supplier Alpha (active)', 'PH20 S3 Inactive Supplier (inactive)'],
    detailFixture: 'PH20-S3-DETAIL-001 (two items; subtotal 16697.25 + shipping 500 + tax 429.75 = 17627.00; zero received/returned/paid)',
    businessBIsolationFixture: 'PH20-S3-B-ORD-001 (Business B only)',
    qaLogin: { email: QA_EMAIL, password: passphrase, permissions: ['purchases.view', 'purchases.edit'] },
    note: 'Status list fixtures have no GRN/payment side effects. Use detail fixture for 3.8; do not use list fixtures for workflow assertions.',
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Phase 20 fixture preparation failed.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
