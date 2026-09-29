import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsController } from './payments.controller';
import { ExpensesController } from './expenses.controller';
import { PaymentsService } from './payments.service';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [InventoryModule],
  // Register the fixed /payments/expenses routes before /payments/:id so the
  // generic payment detail route cannot capture the expenses collection URL.
  controllers: [ExpensesController, PaymentsController],
  providers: [PaymentsService, ExpensesService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
