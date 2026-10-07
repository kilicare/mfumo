ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_id_key" UNIQUE ("businessId", "id");

CREATE TABLE "ProductImage" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'image/webp',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductImage_productId_sortOrder_key" ON "ProductImage"("productId", "sortOrder");
CREATE INDEX "ProductImage_businessId_productId_idx" ON "ProductImage"("businessId", "productId");

ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_businessId_productId_fkey"
  FOREIGN KEY ("businessId", "productId") REFERENCES "Product"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
