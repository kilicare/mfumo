-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "issuedDate" TIMESTAMP(3),
ADD COLUMN     "paymentTerms" TEXT NOT NULL DEFAULT 'COD',
ADD COLUMN     "referenceNumber" TEXT;

-- AlterTable
ALTER TABLE "SalesInvoiceItem" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "discountPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "expiryDate" TEXT,
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SalesReturn" ADD COLUMN     "authorizedAt" TIMESTAMP(3),
ADD COLUMN     "authorizedBy" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedBy" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedBy" TEXT;

-- AlterTable
ALTER TABLE "SalesReturnItem" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "salesInvoiceItemId" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "SalesReturnItem_salesInvoiceItemId_idx" ON "SalesReturnItem"("salesInvoiceItemId");

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_salesInvoiceItemId_fkey" FOREIGN KEY ("salesInvoiceItemId") REFERENCES "SalesInvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
