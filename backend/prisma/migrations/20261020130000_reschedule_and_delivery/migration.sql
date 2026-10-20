ALTER TABLE "Reminder"
  ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryStatus" TEXT,
  ADD COLUMN "deliveryErrorCodes" JSONB,
  ADD COLUMN "deliveryUpdatedAt" TIMESTAMP(3);

ALTER TABLE "ReplyOutbox"
  ADD COLUMN "deliveryStatus" TEXT,
  ADD COLUMN "deliveryErrorCodes" JSONB,
  ADD COLUMN "deliveryUpdatedAt" TIMESTAMP(3);
