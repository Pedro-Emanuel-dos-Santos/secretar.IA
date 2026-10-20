CREATE TABLE "ContactPreference" (
  "phoneNumberId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "remindersPaused" BOOLEAN NOT NULL DEFAULT false,
  "pausedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactPreference_pkey" PRIMARY KEY ("phoneNumberId", "phone")
);
