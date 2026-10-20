ALTER TABLE "Reminder" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'active';
CREATE INDEX "Reminder_userId_state_remindAt_idx" ON "Reminder"("userId", "state", "remindAt");
