ALTER TABLE "IncomingMessage" ADD COLUMN "mediaId" TEXT,
  ADD COLUMN "mediaMimeType" TEXT,
  ADD COLUMN "transcribedAt" TIMESTAMP(3);
