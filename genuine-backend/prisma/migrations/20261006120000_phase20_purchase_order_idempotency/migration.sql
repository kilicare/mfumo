ALTER TABLE "PurchaseOrder"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "PurchaseOrder_businessId_idempotencyKey_key"
ON "PurchaseOrder"("businessId", "idempotencyKey");
