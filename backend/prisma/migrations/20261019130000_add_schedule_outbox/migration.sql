ALTER TABLE "Reminder"
ADD COLUMN "sourceMessageId" TEXT,
ADD COLUMN "deliveryStartedAt" TIMESTAMP(3),
ADD COLUMN "providerMessageId" TEXT;

CREATE UNIQUE INDEX "Reminder_sourceMessageId_key" ON "Reminder"("sourceMessageId");
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_sourceMessageId_fkey"
FOREIGN KEY ("sourceMessageId") REFERENCES "IncomingMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ScheduleOutbox" (
  "id" TEXT NOT NULL,
  "reminderId" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleOutbox_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" > 0)
);
CREATE UNIQUE INDEX "ScheduleOutbox_reminderId_key" ON "ScheduleOutbox"("reminderId");
CREATE INDEX "ScheduleOutbox_phoneNumberId_status_nextAttemptAt_idx"
ON "ScheduleOutbox"("phoneNumberId", "status", "nextAttemptAt");
ALTER TABLE "ScheduleOutbox" ADD CONSTRAINT "ScheduleOutbox_reminderId_fkey"
FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
