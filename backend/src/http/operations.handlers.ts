import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { createAdminGuard } from "./admin.guard";
import { operationalOverview } from "../domain/operations.overview";
import {aiOperationalOverview} from "../domain/ai.operations";

type Store = Pick<PrismaClient, "incomingMessage" | "replyOutbox" | "scheduleOutbox" | "reminder"> & Partial<Pick<PrismaClient,"aiUsage">>;
export function createOperationsRouter(store: Store, config: { adminToken(): string | undefined; phoneNumberId(): string | undefined }) {
  const router = Router();
  router.use(createAdminGuard(config.adminToken));
  router.get("/", async (_, res) => {
    const phoneNumberId = config.phoneNumberId();
    if (!phoneNumberId) return res.sendStatus(503);
    try { const overview=await operationalOverview(store, phoneNumberId);return res.json({...overview,...(store.aiUsage?{ai:await aiOperationalOverview({aiUsage:store.aiUsage},phoneNumberId)}:{})}); }
    catch { return res.status(503).json({ error: "Não foi possível consultar a operação." }); }
  });
  return router;
}
