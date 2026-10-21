-- Additive migration: existing reminders and notes are preserved.
CREATE TABLE "BusinessSubject" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "phoneNumberId" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "normalizedName" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "BusinessSubject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessSubject_userId_phoneNumberId_kind_normalizedName_key" ON "BusinessSubject"("userId","phoneNumberId","kind","normalizedName");
CREATE TABLE "Appointment" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "phoneNumberId" TEXT NOT NULL,
 "subjectId" TEXT, "title" TEXT NOT NULL, "description" TEXT,
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3),
 "state" TEXT NOT NULL DEFAULT 'active', "version" INTEGER NOT NULL DEFAULT 0,
 "sourceMessageId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Appointment_sourceMessageId_key" ON "Appointment"("sourceMessageId");
CREATE INDEX "Appointment_userId_phoneNumberId_state_startsAt_idx" ON "Appointment"("userId","phoneNumberId","state","startsAt");
CREATE TABLE "KnowledgeFact" (
 "id" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "key" TEXT NOT NULL, "value" TEXT NOT NULL,
 "revision" INTEGER NOT NULL, "supersededAt" TIMESTAMP(3), "sourceMessageId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "KnowledgeFact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeFact_sourceMessageId_key" ON "KnowledgeFact"("sourceMessageId");
CREATE UNIQUE INDEX "KnowledgeFact_subjectId_key_revision_key" ON "KnowledgeFact"("subjectId","key","revision");
CREATE INDEX "KnowledgeFact_subjectId_supersededAt_idx" ON "KnowledgeFact"("subjectId","supersededAt");
ALTER TABLE "Reminder" ADD COLUMN "appointmentId" TEXT, ADD COLUMN "appointmentOffsetMinutes" DOUBLE PRECISION;
CREATE INDEX "Reminder_appointmentId_idx" ON "Reminder"("appointmentId");
ALTER TABLE "BusinessSubject" ADD CONSTRAINT "BusinessSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "BusinessSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "IncomingMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeFact" ADD CONSTRAINT "KnowledgeFact_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "BusinessSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeFact" ADD CONSTRAINT "KnowledgeFact_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "IncomingMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
