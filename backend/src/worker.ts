import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { sendWhatsAppMessage } from "./services/whatsapp.service";

const prisma = new PrismaClient();

const connection = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

new Worker(
  "reminders",
  async (job) => {
    console.log("🔔 LEMBRETE DISPARADO!");
    console.log(job.data);

    console.log("📲 Serviço WhatsApp será chamado agora");

    const result = await sendWhatsAppMessage(job.data.phone, job.data.message);

    console.log("📲 Resultado do envio:", result);
    
    if (job.data.reminderId) {
      await prisma.reminder.update({
        where: { id: job.data.reminderId },
        data: { status: "sent" },
      });

      console.log("✅ WhatsApp enviado e status atualizado para sent");
    }
  },
  { connection }
);

console.log("🚀 Worker iniciado...");