CREATE INDEX "IncomingMessage_phoneNumberId_phone_receivedAt_idx" ON "IncomingMessage"("phoneNumberId", "phone", "receivedAt");
CREATE INDEX "Reminder_userId_createdAt_idx" ON "Reminder"("userId", "createdAt");
