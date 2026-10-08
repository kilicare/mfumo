CREATE TABLE "FeedbackMessage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackMessage_businessId_submissionId_createdAt_idx"
ON "FeedbackMessage"("businessId", "submissionId", "createdAt");

ALTER TABLE "FeedbackMessage"
ADD CONSTRAINT "FeedbackMessage_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackMessage"
ADD CONSTRAINT "FeedbackMessage_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "FeedbackSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackMessage"
ADD CONSTRAINT "FeedbackMessage_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "FeedbackMessage" (
    "id", "businessId", "submissionId", "senderId", "senderType",
    "senderName", "senderEmail", "body", "createdAt"
)
SELECT
    'legacy-' || feedback."id",
    feedback."businessId",
    feedback."id",
    feedback."submittedById",
    'USER',
    feedback."submitterName",
    feedback."submitterEmail",
    feedback."message",
    feedback."createdAt"
FROM "FeedbackSubmission" AS feedback;
