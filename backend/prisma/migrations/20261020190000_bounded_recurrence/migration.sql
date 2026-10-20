ALTER TABLE "Reminder" ADD COLUMN "seriesId" TEXT,
  ADD COLUMN "occurrenceIndex" INTEGER,
  ADD COLUMN "recurrenceFrequency" TEXT,
  ADD COLUMN "recurrenceCount" INTEGER;
CREATE UNIQUE INDEX "Reminder_seriesId_occurrenceIndex_key" ON "Reminder"("seriesId", "occurrenceIndex");
