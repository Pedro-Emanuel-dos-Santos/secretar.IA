CREATE TABLE "SubjectPending" (
 "id" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "phoneNumberId" TEXT NOT NULL,
 "subjectId" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "normalizedTitle" TEXT NOT NULL,
 "nextAction" TEXT,
 "waitingFor" TEXT,
 "state" TEXT NOT NULL DEFAULT 'pending',
 "version" INTEGER NOT NULL DEFAULT 0,
 "sourceMessageId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SubjectPending_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SubjectPending_state_check" CHECK ("state" IN ('pending','waiting','completed','cancelled')),
 CONSTRAINT "SubjectPending_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SubjectPending_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "BusinessSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SubjectPending_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "IncomingMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubjectPending_sourceMessageId_key" ON "SubjectPending"("sourceMessageId");
CREATE INDEX "SubjectPending_userId_phoneNumberId_state_updatedAt_idx" ON "SubjectPending"("userId","phoneNumberId","state","updatedAt");
CREATE INDEX "SubjectPending_subjectId_normalizedTitle_state_idx" ON "SubjectPending"("subjectId","normalizedTitle","state");
