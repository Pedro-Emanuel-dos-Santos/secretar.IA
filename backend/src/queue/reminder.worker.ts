import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendWhatsAppReminder } from "../services/whatsapp.service";
import { deliverReminder } from "../domain/reminder.delivery";
import { reconcileStoredDelivery } from "../domain/delivery.receipts";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (!phoneNumberId) throw new Error("Configure WHATSAPP_PHONE_NUMBER_ID.");

const worker = new Worker("reminders", async job => {
  if (typeof job.data.reminderId !== "string" || !job.data.reminderId) throw new Error("Job sem identidade persistente de lembrete.");
  const version = job.data.scheduleVersion ?? 0;
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("Versão de agendamento inválida.");
  await deliverReminder(job.data.reminderId, phoneNumberId, prisma, sendWhatsAppReminder, version,
    id => reconcileStoredDelivery(prisma, phoneNumberId, id));
}, { connection: redisConnection });

worker.on("error", () => console.error("Worker de lembretes: falha de conexão."));

console.log("Worker de lembretes iniciado.");
