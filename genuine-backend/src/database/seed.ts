// @ts-ignore
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test business
  const business = await prisma.business.create({
    data: {
      name: 'Genuine Liquor Store',
      description: 'Premium liquor distribution business',
      businessType: 'Distribution',
      phone: '+255 787 123456',
      email: 'info@genuineliquor.co.tz',
      address: 'Dar es Salaam, Tanzania',
      currency: 'TZS',
      taxPercentage: 18.0,
      allowNegativeStock: false,
      costingMethod: 'WEIGHTED_AVERAGE',
    },
  });

  console.log('✅ Business created:', business.id);

  // Create default roles
  const ownerRole = await prisma.role.create({
    data: {
      businessId: business.id,
      name: 'Owner',
      description: 'Business owner with full access',
      isDefault: true,
      isSystem: true,
    },
  });

  await prisma.role.create({
    data: {
      businessId: business.id,
      name: 'Admin',
      description: 'Administrator',
      isDefault: false,
      isSystem: true,
    },
  });

  await prisma.role.create({
    data: {
      businessId: business.id,
      name: 'Manager',
      description: 'Manager',
      isDefault: false,
      isSystem: true,
    },
  });

  await prisma.role.create({
    data: {
      businessId: business.id,
      name: 'Salesperson',
      description: 'Sales representative',
      isDefault: false,
      isSystem: true,
    },
  });

  console.log('✅ Default roles created');

  // Create default permissions
  const permissions = [
    // Products
    { key: 'products.view', category: 'products', action: 'view' },
    { key: 'products.create', category: 'products', action: 'create' },
    { key: 'products.edit', category: 'products', action: 'edit' },
    { key: 'products.delete', category: 'products', action: 'delete' },

    // Sales
    { key: 'sales.view', category: 'sales', action: 'view' },
    { key: 'sales.create', category: 'sales', action: 'create' },
    { key: 'sales.edit', category: 'sales', action: 'edit' },
    { key: 'sales.cancel', category: 'sales', action: 'cancel' },

    // Purchases
    { key: 'purchases.view', category: 'purchases', action: 'view' },
    { key: 'purchases.create', category: 'purchases', action: 'create' },
    { key: 'purchases.edit', category: 'purchases', action: 'edit' },

    // Inventory
    { key: 'inventory.view', category: 'inventory', action: 'view' },
    { key: 'inventory.adjust', category: 'inventory', action: 'adjust' },
    { key: 'inventory.transfer', category: 'inventory', action: 'transfer' },

    // Expenses
    { key: 'expenses.view', category: 'expenses', action: 'view' },
    { key: 'expenses.create', category: 'expenses', action: 'create' },

    // Reports
    { key: 'reports.view', category: 'reports', action: 'view' },

    // Admin
    { key: 'users.manage', category: 'users', action: 'manage' },
    { key: 'settings.edit', category: 'settings', action: 'edit' },
    { key: 'audit.view', category: 'audit', action: 'view' },
  ];

  const createdPermissions = [];
  for (const perm of permissions) {
    const created = await prisma.permission.create({
      data: {
        businessId: business.id,
        key: perm.key,
        name: perm.key.replace('_', ' ').toUpperCase(),
        category: perm.category,
        action: perm.action,
        isSystem: true,
      },
    });
    createdPermissions.push(created);
  }

  console.log(`✅ ${createdPermissions.length} permissions created`);

  // Assign all permissions to Owner role
  await prisma.role.update({
    where: { id: ownerRole.id },
    data: {
      permissions: {
        connect: createdPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  console.log('✅ Permissions assigned to Owner role');

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.create({
    data: {
      businessId: business.id,
      email: 'admin@genuineliquor.co.tz',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      isActive: true,
      isVerified: true,
      roles: {
        connect: [{ id: ownerRole.id }],
      },
      permissions: {
        connect: createdPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  console.log('✅ Admin user created:', adminUser.email);

  // Create default units
  const units = [
    { name: 'Piece', symbol: 'pcs' },
    { name: 'Bottle', symbol: 'btl' },
    { name: 'Carton', symbol: 'ctn' },
    { name: 'Crate', symbol: 'crt' },
    { name: 'Box', symbol: 'box' },
    { name: 'Bag', symbol: 'bag' },
    { name: 'Kilogram', symbol: 'kg' },
    { name: 'Gram', symbol: 'g' },
    { name: 'Litre', symbol: 'L' },
    { name: 'Dozen', symbol: 'dz' },
    { name: 'Meter', symbol: 'm' },
    { name: 'Set', symbol: 'set' },
  ];

  for (const unit of units) {
    await prisma.unit.create({
      data: {
        businessId: business.id,
        name: unit.name,
        symbol: unit.symbol,
        isSystem: true,
      },
    });
  }

  console.log(`✅ ${units.length} default units created`);

  // Create default payment methods
  const paymentMethods = [
    { name: 'Cash', code: 'CASH' },
    { name: 'Bank Transfer', code: 'BANK' },
    { name: 'M-Pesa', code: 'MPESA' },
    { name: 'Tigo Pesa', code: 'TIGO' },
    { name: 'Airtel Money', code: 'AIRTEL' },
    { name: 'Halopesa', code: 'HALOPESA' },
    { name: 'Credit', code: 'CREDIT' },
  ];

  for (const method of paymentMethods) {
    await prisma.paymentMethod.create({
      data: {
        businessId: business.id,
        name: method.name,
        code: method.code,
        isSystem: true,
      },
    });
  }

  console.log(`✅ ${paymentMethods.length} default payment methods created`);

  // Create default expense categories
  const expenseCategories = [
    { name: 'Salary', code: 'SALARY' },
    { name: 'Transport', code: 'TRANSPORT' },
    { name: 'Fuel', code: 'FUEL' },
    { name: 'Electricity', code: 'ELECTRICITY' },
    { name: 'Water', code: 'WATER' },
    { name: 'Rent', code: 'RENT' },
    { name: 'Internet', code: 'INTERNET' },
    { name: 'Maintenance', code: 'MAINTENANCE' },
    { name: 'Office Supplies', code: 'OFFICE' },
    { name: 'Marketing', code: 'MARKETING' },
    { name: 'Tax', code: 'TAX' },
    { name: 'Bank Charges', code: 'BANK_CHARGES' },
  ];

  for (const category of expenseCategories) {
    await prisma.expenseCategory.create({
      data: {
        businessId: business.id,
        name: category.name,
        code: category.code,
        isSystem: true,
      },
    });
  }

  console.log(
    `✅ ${expenseCategories.length} default expense categories created`,
  );

  // Create default customer type
  await prisma.customerType.create({
    data: {
      businessId: business.id,
      name: 'Retail',
      isSystem: true,
    },
  });

  await prisma.customerType.create({
    data: {
      businessId: business.id,
      name: 'Wholesale',
      isSystem: true,
    },
  });

  console.log('✅ Default customer types created');

  // Create default location (Main Warehouse)
  const mainLocation = await prisma.location.create({
    data: {
      businessId: business.id,
      name: 'Main Warehouse',
      code: 'MAIN',
      type: 'WAREHOUSE',
      managerId: adminUser.id,
    },
  });

  console.log('✅ Main warehouse location created');

  // Create default category
  const beverageCategory = await prisma.category.create({
    data: {
      businessId: business.id,
      name: 'Beverages',
      description: 'All beverage products',
    },
  });

  console.log('✅ Default category created');

  // Create test supplier
  const testSupplier = await prisma.supplier.create({
    data: {
      businessId: business.id,
      name: 'Test Supplier Ltd',
      phone: '+255 789 654321',
      email: 'supplier@example.com',
      address: 'Dar es Salaam',
      contactPerson: 'John Supplier',
      paymentTerms: 'NET-30',
    },
  });

  console.log('✅ Test supplier created');

  // Create test product
  const testProduct = await prisma.product.create({
    data: {
      businessId: business.id,
      sku: 'BEV-001',
      name: 'Coca Cola 500ml',
      barcode: '123456789',
      categoryId: beverageCategory.id,
      supplierId: testSupplier.id,
      buyingPrice: 1500,
      sellingPrice: 2000,
      minimumStock: 20,
      reorderLevel: 30,
      defaultUnit: 'Bottle',
    },
  });

  console.log('✅ Test product created');

  // Create stock balance for test product
  await prisma.stockBalance.create({
    data: {
      businessId: business.id,
      productId: testProduct.id,
      locationId: mainLocation.id,
      quantity: 100,
    },
  });

  console.log('✅ Stock balance created for test product');

  // Create test customer
  const retailCustomerType = await prisma.customerType.findFirst({
    where: { businessId: business.id, name: 'Retail' },
  });

  if (retailCustomerType) {
    await prisma.customer.create({
      data: {
        businessId: business.id,
        name: 'Test Customer',
        phone: '+255 700 123456',
        email: 'customer@example.com',
        address: 'Dar es Salaam',
        customerTypeId: retailCustomerType.id,
        creditLimit: 5000000,
      },
    });
    console.log('✅ Test customer created');
  }

  // Create costing method
  await prisma.costingMethod.create({
    data: {
      businessId: business.id,
      method: 'WEIGHTED_AVERAGE',
    },
  });

  console.log('✅ Costing method created');

  // Create initial financial summary for current month
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const period = `${year}-${month}`;

  const startDate = new Date(year, now.getMonth(), 1);
  const endDate = new Date(year, now.getMonth() + 1, 0);

  await prisma.financialSummary.create({
    data: {
      businessId: business.id,
      period,
      startDate,
      endDate,
    },
  });

  console.log('✅ Financial summary created for current month');

  // Create accounting period
  await prisma.accountingPeriod.create({
    data: {
      businessId: business.id,
      period,
      startDate,
      endDate,
    },
  });

  console.log('✅ Accounting period created');

  console.log('\n✅ ✅ ✅ SEEDING COMPLETE! ✅ ✅ ✅\n');
  console.log('Test Credentials:');
  console.log('Email: admin@genuineliquor.co.tz');
  console.log('Password: admin123');
  console.log('\nBusiness ID:', business.id);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
