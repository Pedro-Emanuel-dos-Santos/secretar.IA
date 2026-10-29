import { httpDrain } from "./runtime/http.drain";
import express from "express";
import cors from "cors";

import { reminderRoutes } from "./routes/reminder.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { createAdminGuard } from "./http/admin.guard";
import { operationsRoutes } from "./routes/operations.routes";
import { prisma } from "./config/prisma";
import { reminderQueue } from "./queue/reminder.queue";
import {createCalendarRouter} from "./http/calendar.handlers";

export const app = express();

app.use(httpDrain.reject);
app.use(cors());
app.use("/", webhookRoutes);
app.use(express.json());

app.get("/health/live", (_, res) => res.json({ status: "alive" }));
app.get("/health/ready", httpDrain.handler(async (_, res) => {
  if(app.locals.shuttingDown)return res.status(503).json({status:"unavailable"});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      httpDrain.work.run(async () => {
        const results = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, reminderQueue.getJobCounts("waiting")]);
        if (results.some(result => result.status === "rejected")) throw new Error("dependency_unavailable");
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 2000); }),
    ]);
    return res.json({ status: "ready" });
  } catch { return res.status(503).json({ status: "unavailable" }); }
  finally { if (timer) clearTimeout(timer); }
}));

/*
|--------------------------------------------------------------------------
| Home
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.json({
    message: "🚀 Secretár.IA API funcionando",
    version: "1.0.0",
  });
});

/*
|--------------------------------------------------------------------------
| Rotas
|--------------------------------------------------------------------------
*/

app.use("/reminders", createAdminGuard(() => process.env.ADMIN_API_TOKEN), reminderRoutes);
app.use("/operations", operationsRoutes);
app.use("/calendar",createCalendarRouter(prisma,{adminToken:()=>process.env.ADMIN_API_TOKEN,phoneNumberId:()=>process.env.WHATSAPP_PHONE_NUMBER_ID}));

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  return res.status(404).json({
    error: "Rota não encontrada.",
  });
});

// Express entry point for serverless hosts; long-running workers start separately.
export default app;
