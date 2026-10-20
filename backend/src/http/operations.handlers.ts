import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { createAdminGuard } from "./admin.guard";
import { operationalOverview } from "../domain/operations.overview";

type Store = Pick<PrismaClient, "incomingMessage" | "replyOutbox" | "scheduleOutbox" | "reminder">;
export function createOperationsRouter(store: Store, config: { adminToken(): string | undefined; phoneNumberId(): string | undefined }) {
  const router = Router();
  router.use(createAdminGuard(config.adminToken));
  router.get("/", async (_, res) => {
    const phoneNumberId = config.phoneNumberId();
    if (!phoneNumberId) return res.sendStatus(503);
    try { return res.json(await operationalOverview(store, phoneNumberId)); }
    catch { return res.status(503).json({ error: "Não foi possível consultar a operação." }); }
  });
  return router;
}
