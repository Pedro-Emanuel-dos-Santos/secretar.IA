import type { PrismaClient } from "@prisma/client";

type Store = Pick<PrismaClient, "reminder">;
type Sender = (phone: string, text: string) => Promise<unknown>;

export async function deliverReminder(reminderId: string, phoneNumberId: string, store: Store, send: Sender) {
  const reminder = await store.reminder.findUnique({
    where: { id: reminderId }, include: { user: true, scheduleOutbox: true },
  });
  if (!reminder) return "missing";
  if (reminder.scheduleOutbox && reminder.scheduleOutbox.phoneNumberId !== phoneNumberId) throw new Error("Número comercial incompatível.");
  const claimed = await store.reminder.updateMany({
    where: { id: reminderId, state: "active", status: { in: ["pending", "scheduled", "scheduling_pending", "scheduling_failed"] } },
    data: { status: "sending", deliveryStartedAt: new Date() },
  });
  if (!claimed.count) return "skipped";
  try {
    const late = Date.now() - reminder.remindAt.getTime() > 60_000;
    const result = await send(reminder.user.phone, `⏰ Lembrete${late ? " atrasado" : ""}: ${reminder.title}`);
    const id = (result as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
    if (typeof id !== "string" || !id) throw new Error("Provedor não confirmou a identidade da mensagem.");
    await store.reminder.updateMany({
      where: { id: reminderId, status: "sending" }, data: { status: "provider_accepted", providerMessageId: id },
    });
    return "provider_accepted";
  } catch {
    await store.reminder.updateMany({
      where: { id: reminderId, status: "sending" }, data: { status: "delivery_unknown" },
    });
    throw new Error("Não foi possível confirmar o resultado do envio do lembrete.");
  }
}
