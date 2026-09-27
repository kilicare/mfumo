import { Module } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { CustomerService } from './customer.service';
import { SupplierCustomerController } from './suppliers-customers.controller';

@Module({
  providers: [SupplierService, CustomerService],
  controllers: [SupplierCustomerController],
  exports: [SupplierService, CustomerService],
})
export class SuppliersCustomersModule {}
