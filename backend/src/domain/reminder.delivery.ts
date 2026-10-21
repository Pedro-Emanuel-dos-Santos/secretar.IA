import type { PrismaClient } from "@prisma/client";
import { WhatsAppPreflightError } from "./whatsapp.policy";
import type { ReminderControls } from "./reminder.buttons";
import { WhatsAppSendRejected } from "./whatsapp.errors";

type Store = Pick<PrismaClient, "reminder">;
type Sender = (phone: string, text: string, controls?: ReminderControls) => Promise<unknown>;

export async function deliverReminder(reminderId: string, phoneNumberId: string, store: Store, send: Sender, expectedVersion = 0,
  reconcile?: (providerMessageId: string) => Promise<void>) {
  const reminder = await store.reminder.findUnique({
    where: { id: reminderId }, include: { user: true, scheduleOutbox: true,subject:{select:{name:true}} },
  });
  if (!reminder) return "missing";
  if (reminder.scheduleOutbox && reminder.scheduleOutbox.phoneNumberId !== phoneNumberId) throw new Error("Número comercial incompatível.");
  if ((reminder.scheduleVersion ?? 0) !== expectedVersion) return "stale";
  const claimed = await store.reminder.updateMany({
    where: { id: reminderId, scheduleVersion: expectedVersion, state: "active", status: { in: ["pending", "scheduled", "scheduling_pending", "scheduling_failed"] } },
    data: { status: "sending", deliveryStartedAt: new Date() },
  });
  if (!claimed.count) return "skipped";
  try {
    const late = Date.now() - reminder.remindAt.getTime() > 60_000;
    const text=`⏰ Lembrete${late ? " atrasado" : ""}: ${reminder.title}${reminder.subject?` (${reminder.subject.name})`:""}`+
      (reminder.appointmentId && reminder.description ? `\n${reminder.description.slice(0,300)}` : "");
    const result = await send(reminder.user.phone, text,
      reminder.appointmentId || reminder.kind==="daily_summary" ? undefined : { id: reminder.id, version: expectedVersion });
    const id = (result as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
    if (typeof id !== "string" || !id) throw new Error("Provedor não confirmou a identidade da mensagem.");
    await store.reminder.updateMany({
      where: { id: reminderId, status: "sending" }, data: { status: "provider_accepted", providerMessageId: id,...(reminder.kind==="daily_summary"?{state:"completed",taskProgress:"completed"}:{}) },
    });
    if (reconcile) {
      try { await reconcile(id); } catch { console.error("Recibo persistido aguarda reconciliação operacional."); }
    }
    return "provider_accepted";
  } catch (error) {
    await store.reminder.updateMany({
      where: { id: reminderId, status: "sending" },
      data: { status: error instanceof WhatsAppPreflightError
        ? error.reason === "reminders_paused" ? "blocked_paused" : "blocked_template"
        : error instanceof WhatsAppSendRejected ? "provider_rejected" : "delivery_unknown",
        ...(error instanceof WhatsAppSendRejected ? {deliveryStatus:"failed",deliveryErrorCodes:error.code === undefined ? [] : [error.code],deliveryUpdatedAt:new Date()} : {}),
      },
    });
    throw new Error("Não foi possível confirmar o resultado do envio do lembrete.");
  }
}
