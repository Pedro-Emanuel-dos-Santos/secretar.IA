import { Lifecycle } from "./runtime/lifecycle";
import "dotenv/config";
const lifecycle = new Lifecycle("inbox");
lifecycle.run(async () => {
  const { prisma } = await import("./config/prisma.js");
  lifecycle.onClose(() => prisma.$disconnect());
  const { reminderQueue } = await import("./queue/reminder.queue.js");
  lifecycle.onClose(() => reminderQueue.close());
  const [{ processInboxBatch }, { conversationDependencies }, { relaySchedules }, { relayReplies },
    { sendWhatsAppMessage }, { reconcileStoredDelivery }, { relayDailySummaries }] = await Promise.all([
    import("./domain/inbox.processor.js"), import("./services/conversation.service.js"), import("./domain/schedule.relay.js"),
    import("./domain/reply.relay.js"), import("./services/whatsapp.service.js"), import("./domain/delivery.receipts.js"), import("./domain/daily-summary.js"),
  ]);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("sender_not_configured");
  const shouldStop = () => lifecycle.stopping;
  while (!shouldStop()) {
    try {
      await prisma.subjectPending.findFirst({ select: { id: true, nextAction: true, state: true, version: true } });
      await prisma.appointment.findFirst({ select: { id: true } }); await prisma.knowledgeFact.findFirst({ select: { id: true } });
      await prisma.reminder.findFirst({ select: { taskProgress: true, waitingFor: true, progressUpdatedAt: true,
        scheduleTimezone: true, kind: true, digestKey: true, subjectId: true } });
      await prisma.contactPreference.findFirst({ select: { timezone: true, audioConsent: true, summaryEnabled: true, summaryTime: true } });
      await prisma.aiUsage.findFirst({ select: { id: true } });
      break;
    } catch { console.error("Aguardando migração; mensagens preservadas."); await lifecycle.wait(10000); }
  }
  if (!shouldStop()) console.log("Worker de entrada iniciado.");
  let nextSummaryScan = 0;
  while (!shouldStop()) {
    try { await processInboxBatch(prisma, conversationDependencies, phoneNumberId, shouldStop); }
    catch { console.error("Falha ao preparar mensagens; consulte a operação."); }
    if (shouldStop()) break;
    if (Date.now() >= nextSummaryScan) {
      nextSummaryScan = Date.now() + 30000;
      try { await relayDailySummaries(prisma, phoneNumberId, new Date(), shouldStop); }
      catch { console.error("Falha ao preparar resumos; próxima varredura preservada."); }
    }
    if (shouldStop()) break;
    try { await relaySchedules(prisma, reminderQueue, { phoneNumberId, shouldStop }); }
    catch { console.error("Falha ao recuperar agendamentos; pendências preservadas."); }
    if (shouldStop()) break;
    if (process.env.WHATSAPP_ACCESS_TOKEN) {
      try { await relayReplies(prisma, sendWhatsAppMessage, phoneNumberId, id => reconcileStoredDelivery(prisma, phoneNumberId, id), shouldStop); }
      catch { console.error("Falha ao confirmar respostas; consulte os estados persistidos."); }
    }
    await lifecycle.wait(1000);
  }
});
