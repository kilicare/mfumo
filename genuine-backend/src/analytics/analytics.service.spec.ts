import { AnalyticsService } from './analytics.service';

describe('AnalyticsService product performance', () => {
  it('allocates invoice-level discounts before subtracting accepted product returns', async () => {
    const productA = {
      id: 'product-a',
      name: 'Product A',
      sku: 'A',
      categoryId: 'category-a',
      category: { name: 'Drinks' },
      buyingPrice: 10,
    };
    const productB = {
      id: 'product-b',
      name: 'Product B',
      sku: 'B',
      categoryId: 'category-b',
      category: { name: 'Snacks' },
      buyingPrice: 5,
    };
    const prisma = {
      business: { findUnique: jest.fn().mockResolvedValue({ id: 'business-a', currency: 'TZS' }) },
      salesInvoice: {
        findMany: jest.fn().mockResolvedValue([{
          discountAmount: 10,
          items: [
            { quantity: 2, total: 60, product: productA },
            { quantity: 1, total: 40, product: productB },
          ],
        }]),
      },
      salesReturn: {
        findMany: jest.fn().mockResolvedValue([{
          items: [{ productId: 'product-a', quantity: 1, total: 5 }],
        }]),
      },
      inventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
      stockBalance: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([productA]) },
    };
    const service = new AnalyticsService(prisma as any, {} as any, {} as any);

    const result = await service.getProductPerformance('business-a', {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      page: 1,
      limit: 20,
      sortBy: 'REVENUE',
    } as any);

    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'product-a', revenue: 49, quantity: 1 }),
      expect.objectContaining({ productId: 'product-b', revenue: 36, quantity: 1 }),
    ]));
    expect(result.data.reduce((sum, product) => sum + product.revenue, 0)).toBe(85);
  });
});

describe('AnalyticsService sales dashboard', () => {
  it('deducts a customer return once from both total revenue and top-customer revenue', async () => {
    const invoice = {
      id: 'invoice-a',
      customerId: 'customer-a',
      issuedDate: new Date('2026-10-05T00:00:00.000Z'),
      totalAmount: 100,
      customer: { id: 'customer-a', name: 'Customer A' },
      items: [],
    };
    const returned = {
      id: 'return-a',
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      totalAmount: 10,
      returnDate: new Date('2026-10-06T00:00:00.000Z'),
      items: [],
      invoice: { customerId: invoice.customerId, customer: invoice.customer },
    };
    const prisma = {
      business: { findUnique: jest.fn().mockResolvedValue({ id: 'business-a', currency: 'TZS' }) },
      accountingPeriod: { findFirst: jest.fn() },
      salesInvoice: { findMany: jest.fn().mockResolvedValue([invoice]) },
      salesReturn: {
        findMany: jest.fn()
          .mockResolvedValueOnce([returned])
          .mockResolvedValueOnce([returned]),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AnalyticsService(prisma as any, {} as any, {} as any);

    const result = await service.getSalesDashboard('business-a', {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    } as any);

    expect(result.metrics.revenue).toBe(90);
    expect(result.topCustomers).toEqual([
      expect.objectContaining({ customerId: 'customer-a', revenue: 90, invoiceCount: 1 }),
    ]);
  });
});
