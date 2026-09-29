-- DropForeignKey
ALTER TABLE "StockAdjustmentItem" DROP CONSTRAINT "StockAdjustmentItem_locationId_fkey";

-- AlterTable
ALTER TABLE "StockAdjustmentItem" ALTER COLUMN "locationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
