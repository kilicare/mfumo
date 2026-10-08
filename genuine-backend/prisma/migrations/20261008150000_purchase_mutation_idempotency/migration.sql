ALTER TABLE "GoodsReceivedNote"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" TEXT;

ALTER TABLE "PurchaseReturn"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "GoodsReceivedNote_businessId_idempotencyKey_key"
  ON "GoodsReceivedNote"("businessId", "idempotencyKey");

CREATE UNIQUE INDEX "PurchaseReturn_businessId_idempotencyKey_key"
  ON "PurchaseReturn"("businessId", "idempotencyKey");
