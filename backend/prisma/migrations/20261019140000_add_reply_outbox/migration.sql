ALTER TABLE "IncomingMessage"
ADD COLUMN "interpretation" JSONB,
ADD COLUMN "interpretationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "executionAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "leaseToken" TEXT,
ADD COLUMN "leaseUntil" TIMESTAMP(3),
ADD COLUMN "lastError" TEXT;
ALTER TABLE "IncomingMessage" ADD CONSTRAINT "IncomingMessage_attempts_check"
CHECK ("interpretationAttempts" >= 0 AND "executionAttempts" >= 0 AND "maxAttempts" > 0);
CREATE INDEX "IncomingMessage_phoneNumberId_status_nextAttemptAt_idx"
ON "IncomingMessage"("phoneNumberId", "status", "nextAttemptAt");

CREATE TABLE "ReplyOutbox" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "refreshReminder" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplyOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReplyOutbox_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "ReplyOutbox_messageId_key" ON "ReplyOutbox"("messageId");
CREATE INDEX "ReplyOutbox_status_createdAt_idx" ON "ReplyOutbox"("status", "createdAt");
ALTER TABLE "ReplyOutbox" ADD CONSTRAINT "ReplyOutbox_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "IncomingMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
