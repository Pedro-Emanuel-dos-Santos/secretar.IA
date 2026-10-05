import express from "express";
import cors from "cors";

import { reminderRoutes } from "./routes/reminder.routes";
import { webhookRoutes } from "./routes/webhook.routes";

export const app = express();

app.use(cors());
app.use(express.json());

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

app.use("/", webhookRoutes);

app.use("/reminders", reminderRoutes);

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