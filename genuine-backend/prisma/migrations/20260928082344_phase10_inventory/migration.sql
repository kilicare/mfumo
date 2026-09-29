/*
  Warnings:

  - Added the required column `locationId` to the `StockAdjustmentItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "StockAdjustment_adjustmentNumber_key";

-- DropIndex
DROP INDEX "StockTransfer_transferNumber_key";

-- AlterTable
ALTER TABLE "GRNItem" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "unitCost" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StockAdjustment" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedBy" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "StockAdjustmentItem" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "currentQty" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "adjustedQty" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "difference" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StockAuditItem" ALTER COLUMN "systemQty" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "physicalQty" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "variance" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "receivedBy" TEXT,
ADD COLUMN     "receivedDate" TIMESTAMP(3),
ADD COLUMN     "sentBy" TEXT,
ADD COLUMN     "sentDate" TIMESTAMP(3),
ALTER COLUMN "transferDate" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "StockTransferItem" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "receivedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "unitCost" DOUBLE PRECISION,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "unit" SET DEFAULT 'UNIT';

-- CreateTable
CREATE TABLE "PhysicalCount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "countNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "varianceCount" INTEGER NOT NULL DEFAULT 0,
    "totalVarianceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedDate" TIMESTAMP(3),
    "postedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "completedBy" TEXT,
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalCountItem" (
    "id" TEXT NOT NULL,
    "physicalCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQuantity" DOUBLE PRECISION NOT NULL,
    "countedQuantity" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "batchNumber" TEXT,
    "notes" TEXT,

    CONSTRAINT "PhysicalCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhysicalCount_businessId_idx" ON "PhysicalCount"("businessId");

-- CreateIndex
CREATE INDEX "PhysicalCount_locationId_idx" ON "PhysicalCount"("locationId");

-- CreateIndex
CREATE INDEX "PhysicalCount_status_idx" ON "PhysicalCount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalCount_businessId_countNumber_key" ON "PhysicalCount"("businessId", "countNumber");

-- CreateIndex
CREATE INDEX "PhysicalCountItem_physicalCountId_idx" ON "PhysicalCountItem"("physicalCountId");

-- CreateIndex
CREATE INDEX "PhysicalCountItem_productId_idx" ON "PhysicalCountItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalCountItem_physicalCountId_productId_batchNumber_key" ON "PhysicalCountItem"("physicalCountId", "productId", "batchNumber");

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCount" ADD CONSTRAINT "PhysicalCount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCount" ADD CONSTRAINT "PhysicalCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCountItem" ADD CONSTRAINT "PhysicalCountItem_physicalCountId_fkey" FOREIGN KEY ("physicalCountId") REFERENCES "PhysicalCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCountItem" ADD CONSTRAINT "PhysicalCountItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
