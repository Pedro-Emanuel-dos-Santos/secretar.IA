import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { deliverReminder } from "../domain/reminder.delivery";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (!phoneNumberId) throw new Error("Configure WHATSAPP_PHONE_NUMBER_ID.");

const worker = new Worker("reminders", async job => {
  if (typeof job.data.reminderId !== "string" || !job.data.reminderId) throw new Error("Job sem identidade persistente de lembrete.");
  await deliverReminder(job.data.reminderId, phoneNumberId, prisma, sendWhatsAppMessage);
}, { connection: redisConnection });

worker.on("error", () => console.error("Worker de lembretes: falha de conexão."));

console.log("Worker de lembretes iniciado.");
