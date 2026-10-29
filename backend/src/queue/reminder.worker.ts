import { Lifecycle } from "../runtime/lifecycle";
import "dotenv/config";
const lifecycle = new Lifecycle("reminders");
lifecycle.run(async () => {
  const { prisma } = await import("../config/prisma.js");
  lifecycle.onClose(() => prisma.$disconnect());
  const [{ Worker }, { redisConnection }, { sendWhatsAppReminder }, { reconcileStoredDelivery },
    { maximumLateness }, { createReminderProcessor }] = await Promise.all([
    import("bullmq"), import("../config/redis.js"), import("../services/whatsapp.service.js"),
    import("../domain/delivery.receipts.js"), import("../domain/reminder.execution.js"), import("./reminder.processor.js"),
  ]);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("sender_not_configured");
  if (lifecycle.stopping) return;
  const worker = new Worker("reminders", createReminderProcessor(prisma, phoneNumberId, sendWhatsAppReminder,
    id => reconcileStoredDelivery(prisma, phoneNumberId, id), { maxLateMs: maximumLateness() }), { connection: redisConnection, autorun: false });
  worker.on("error", () => console.error("Worker de lembretes: falha de conexão."));
  lifecycle.onDrain(() => worker.close()); // Stop fetching; finish the claimed job.
  while (!lifecycle.stopping) {
    try {
      await prisma.reminder.findFirst({ select: { id: true, appointmentId: true, appointmentOffsetMinutes: true,
        taskProgress: true, waitingFor: true, progressUpdatedAt: true, scheduleTimezone: true, kind: true,
        digestKey: true, subjectId: true } });
      break;
    } catch { console.error("Aguardando migração dos avisos; fila preservada."); await lifecycle.wait(10000); }
  }
  if (!lifecycle.stopping) { console.log("Worker de lembretes iniciado."); await worker.run(); }
});
