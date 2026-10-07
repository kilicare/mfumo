ALTER TABLE "Unit" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Brand" ADD COLUMN "businessId" TEXT;

DROP INDEX "Unit_name_key";
DROP INDEX "Unit_symbol_key";
DROP INDEX "Brand_name_key";

CREATE UNIQUE INDEX "Unit_businessId_name_key" ON "Unit"("businessId", "name");
CREATE UNIQUE INDEX "Unit_businessId_symbol_key" ON "Unit"("businessId", "symbol");
CREATE UNIQUE INDEX "Unit_shared_name_key" ON "Unit"("name") WHERE "businessId" IS NULL;
CREATE UNIQUE INDEX "Unit_shared_symbol_key" ON "Unit"("symbol") WHERE "businessId" IS NULL;
CREATE INDEX "Unit_businessId_idx" ON "Unit"("businessId");

CREATE UNIQUE INDEX "Brand_businessId_name_key" ON "Brand"("businessId", "name");
CREATE UNIQUE INDEX "Brand_shared_name_key" ON "Brand"("name") WHERE "businessId" IS NULL;
CREATE INDEX "Brand_businessId_idx" ON "Brand"("businessId");

ALTER TABLE "Unit" ADD CONSTRAINT "Unit_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
