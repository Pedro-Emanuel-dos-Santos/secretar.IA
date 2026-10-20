CREATE TABLE "IncomingMessage" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "IncomingMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncomingMessage_phoneNumberId_providerMessageId_key"
ON "IncomingMessage"("phoneNumberId", "providerMessageId");
CREATE INDEX "IncomingMessage_phoneNumberId_status_receivedAt_idx"
ON "IncomingMessage"("phoneNumberId", "status", "receivedAt");
