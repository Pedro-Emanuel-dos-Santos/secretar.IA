-- Task progress is independent of scheduling/provider delivery state.
ALTER TABLE "Reminder"
 ADD COLUMN "taskProgress" TEXT NOT NULL DEFAULT 'pending',
 ADD COLUMN "waitingFor" TEXT,
 ADD COLUMN "progressUpdatedAt" TIMESTAMP(3);
UPDATE "Reminder" SET "taskProgress"='completed' WHERE "state"='completed';
UPDATE "Reminder" SET "taskProgress"='cancelled' WHERE "state"='cancelled';
CREATE INDEX "Reminder_userId_taskProgress_state_idx" ON "Reminder"("userId","taskProgress","state");
