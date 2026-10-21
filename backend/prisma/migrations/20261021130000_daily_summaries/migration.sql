ALTER TABLE "ContactPreference" ADD COLUMN "summaryEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "summaryTime" TEXT;
ALTER TABLE "Reminder" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'task', ADD COLUMN "digestKey" TEXT;
CREATE UNIQUE INDEX "Reminder_digestKey_key" ON "Reminder"("digestKey");
