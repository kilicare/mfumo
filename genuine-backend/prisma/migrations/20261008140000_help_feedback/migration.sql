CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "submittedById" TEXT,
    "submitterName" TEXT NOT NULL,
    "submitterEmail" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "pagePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackSubmission_businessId_status_createdAt_idx"
ON "FeedbackSubmission"("businessId", "status", "createdAt");

CREATE INDEX "FeedbackSubmission_businessId_submittedById_createdAt_idx"
ON "FeedbackSubmission"("businessId", "submittedById", "createdAt");

ALTER TABLE "FeedbackSubmission"
ADD CONSTRAINT "FeedbackSubmission_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackSubmission"
ADD CONSTRAINT "FeedbackSubmission_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
