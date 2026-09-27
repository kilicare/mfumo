const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runPO01() {
  console.log('====================================================');
  console.log('🧪 TEST CASE: PO-01 — Create Purchase Order (Draft)');
  console.log('====================================================');

  try {
    // 1. Login
    const loginRes = await fetch('http://localhost:3002/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@genuineliquor.co.tz', password: 'admin123' }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken || loginData.accessToken;

    if (!token) {
      console.error('❌ Failed to login and retrieve token:', loginData);
      process.exit(1);
    }
    console.log('1. Login successful ✅ (Token acquired)');

    // 2. Query test entities
    const supplier = await prisma.supplier.findFirst();
    const location = await prisma.location.findFirst();
    const product = await prisma.product.findFirst();

    console.log('2. Test entities found:', {
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      locationId: location?.id,
      locationName: location?.name,
      productId: product?.id,
      productName: product?.name,
    });

    // 3. Create PO Payload
    const poPayload = {
      supplierId: supplier.id,
      locationId: location.id,
      items: [
        {
          productId: product.id,
          quantity: 50,
          unitPrice: 20000,
          discount: 5,
          notes: 'Test PO Item',
        },
      ],
      shippingCost: 15000,
      taxPercentage: 18,
      notes: 'Initial test order for Phase 8',
    };

    const createRes = await fetch('http://localhost:3002/api/v1/purchases/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(poPayload),
    });

    const createData = await createRes.json();
    console.log('3. API Response status:', createRes.status);
    console.log('PO Response Data:', JSON.stringify(createData, null, 2));

    const po = createData.data || createData;
    const isDraft = po.status === 'DRAFT';
    const subtotalCorrect = po.subtotal === 1000000;
    const totalCorrect = po.totalAmount === 1136000;
    const hasItems = po.items && po.items.length === 1;

    console.log('\n4. Verification Assertions:');
    console.log(' - HTTP Status == 201:', createRes.status === 201 ? 'PASS ✅' : 'FAIL ❌');
    console.log(' - Status is DRAFT:', isDraft ? 'PASS ✅' : 'FAIL ❌');
    console.log(' - Subtotal is 1,000,000 (50 * 20,000):', subtotalCorrect ? 'PASS ✅' : 'FAIL ❌');
    console.log(' - Discount is 50,000 (5%):', po.discountAmount === 50000 ? 'PASS ✅' : 'FAIL ❌');
    console.log(' - Tax is 171,000 (18% of 950,000):', po.taxAmount === 171000 ? 'PASS ✅' : 'FAIL ❌');
    console.log(' - Total is 1,136,000 (950k + 171k + 15k):', totalCorrect ? 'PASS ✅' : 'FAIL ❌');
    console.log(' - Items count is 1:', hasItems ? 'PASS ✅' : 'FAIL ❌');
    console.log(' - PO Number generated:', po.poNumber);

    if (
      createRes.status === 201 &&
      isDraft &&
      subtotalCorrect &&
      po.discountAmount === 50000 &&
      po.taxAmount === 171000 &&
      totalCorrect &&
      hasItems
    ) {
      console.log('\n========================================');
      console.log('🎉 [PO-01] RESULT: GREEN ✅');
      console.log('========================================\n');
    } else {
      console.log('\n❌ [PO-01] RESULT: FAILED ❌\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Execution Error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPO01();
