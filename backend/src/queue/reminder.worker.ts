import { Worker } from "bullmq";
import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendWhatsAppMessage } from "../services/whatsapp.service";

new Worker(
  "reminders",
  async (job) => {
    console.log("🔔 LEMBRETE DISPARADO!");
    console.log(job.data);

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
  {
    connection: redisConnection,
  }
);

console.log("🚀 Worker iniciado...");