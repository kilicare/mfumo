ALTER TABLE "ExpenseCategory"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "budgetLimit" DOUBLE PRECISION,
  ADD COLUMN "budgetPeriod" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ExpenseCategory"
SET "code" = UPPER(
  COALESCE(NULLIF(trim(BOTH '_' FROM regexp_replace("name", '[^A-Za-z0-9]+', '_', 'g')), ''), 'CATEGORY')
  || '_' || substring("id" FROM 1 FOR 6)
);

ALTER TABLE "ExpenseCategory" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "ExpenseCategory_businessId_code_key" ON "ExpenseCategory"("businessId", "code");

ALTER TABLE "Expense"
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "supplierId" TEXT,
  ADD COLUMN "budgetCode" TEXT,
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "approvalNotes" TEXT,
  ADD COLUMN "rejectedBy" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3);

CREATE INDEX "Expense_businessId_supplierId_idx" ON "Expense"("businessId", "supplierId");
CREATE INDEX "Expense_businessId_status_expenseDate_idx" ON "Expense"("businessId", "status", "expenseDate");

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_paidBy_fkey" FOREIGN KEY ("paidBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseCategory"
  ADD CONSTRAINT "ExpenseCategory_budgetLimit_nonnegative_check" CHECK ("budgetLimit" IS NULL OR "budgetLimit" >= 0),
  ADD CONSTRAINT "ExpenseCategory_budgetPeriod_check" CHECK ("budgetPeriod" IS NULL OR "budgetPeriod" IN ('MONTHLY', 'QUARTERLY', 'YEARLY'));

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_amount_positive_check" CHECK ("amount" > 0);

ALTER TABLE "ExpenseItem"
  ADD CONSTRAINT "ExpenseItem_amount_positive_check" CHECK ("amount" > 0);
