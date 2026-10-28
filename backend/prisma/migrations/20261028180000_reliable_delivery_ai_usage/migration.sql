ALTER TABLE "Reminder" ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "deliveryRetryAt" TIMESTAMP(3);
ALTER TABLE "AiUsage" ADD COLUMN "routingReason" TEXT,
 ADD COLUMN "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "providerAttempts" JSONB,
 ADD COLUMN "estimatedCostUsd" DOUBLE PRECISION,
 ADD COLUMN "pricingVersion" TEXT,
 ADD COLUMN "costStatus" TEXT;
