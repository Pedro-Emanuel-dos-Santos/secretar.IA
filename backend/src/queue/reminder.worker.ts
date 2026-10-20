import "dotenv/config";
import { Worker, DelayedError } from "bullmq";
import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendWhatsAppReminder } from "../services/whatsapp.service";
import { deliverReminder } from "../domain/reminder.delivery";
import { reconcileStoredDelivery } from "../domain/delivery.receipts";
import { maximumLateness, prepareReminderExecution } from "../domain/reminder.execution";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (!phoneNumberId) throw new Error("Configure WHATSAPP_PHONE_NUMBER_ID.");

const maxLateMs = maximumLateness();
const worker = new Worker("reminders", async (job, token) => {
  if (typeof job.data.reminderId !== "string" || !job.data.reminderId) throw new Error("Job sem identidade persistente de lembrete.");
  const version = job.data.scheduleVersion ?? 0;
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("Versão de agendamento inválida.");
  const decision = await prepareReminderExecution(prisma,job.data.reminderId,phoneNumberId,version,Date.now(),maxLateMs);
  if (decision.kind === "defer") {
    await job.moveToDelayed(decision.until,token);
    throw new DelayedError();
  }
  if (decision.kind !== "ready") return;
  await deliverReminder(job.data.reminderId, phoneNumberId, prisma, sendWhatsAppReminder, version,
    id => reconcileStoredDelivery(prisma, phoneNumberId, id));
}, { connection: redisConnection });

worker.on("error", () => console.error("Worker de lembretes: falha de conexão."));

let stopping=false;
async function stop() {
  if(stopping)return;stopping=true;
  const deadline=setTimeout(()=>process.exit(1),30000);deadline.unref();
  try {await worker.close();await prisma.$disconnect();clearTimeout(deadline);process.exit(0);}
  catch {console.error("Worker de lembretes encerrado com pendências preservadas.");process.exit(1);}
}
process.on("SIGTERM",()=>void stop());
process.on("SIGINT",()=>void stop());

console.log("Worker de lembretes iniciado.");
