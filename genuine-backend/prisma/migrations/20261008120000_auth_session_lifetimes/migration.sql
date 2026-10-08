ALTER TABLE "UserSession"
ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3);

UPDATE "UserSession"
SET "absoluteExpiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "absoluteExpiresAt" IS NULL;

ALTER TABLE "UserSession"
ALTER COLUMN "absoluteExpiresAt" SET NOT NULL;

CREATE INDEX "UserSession_absoluteExpiresAt_idx"
ON "UserSession"("absoluteExpiresAt");
