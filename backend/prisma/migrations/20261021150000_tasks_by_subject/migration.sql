ALTER TABLE "Reminder" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "BusinessSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Reminder_subjectId_state_taskProgress_idx" ON "Reminder"("subjectId", "state", "taskProgress");
