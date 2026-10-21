ALTER TABLE "ContactPreference"
 ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
 ADD COLUMN "displayName" TEXT,
 ADD COLUMN "businessType" TEXT,
 ADD COLUMN "onboardedAt" TIMESTAMP(3),
 ADD COLUMN "audioConsent" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "audioConsentAt" TIMESTAMP(3),
 ADD COLUMN "audioConsentProvider" TEXT;
ALTER TABLE "Reminder" ADD COLUMN "scheduleTimezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
CREATE TABLE "AiUsage" (
 "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
 "provider" TEXT NOT NULL, "model" TEXT, "inputTokens" INTEGER, "outputTokens" INTEGER,
 "cachedInputTokens" INTEGER, "elapsedMs" INTEGER, "outcome" TEXT NOT NULL DEFAULT 'started',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiUsage_messageId_attempt_key" ON "AiUsage"("messageId","attempt");
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "IncomingMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
