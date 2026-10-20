import type { PrismaClient } from "@prisma/client";
import { formatReminderReply } from "./action.executor";
import { WhatsAppPreflightError } from "./whatsapp.policy";

type Store = Pick<PrismaClient, "replyOutbox" | "$transaction">;
type Sender = (phone: string, text: string) => Promise<unknown>;

export async function relayReplies(store: Store, send: Sender, phoneNumberId: string,
  reconcile?: (providerMessageId: string) => Promise<void>) {
  const rows = await store.replyOutbox.findMany({
    where: { status: "pending", message: { phoneNumberId, status: "reply_pending" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20,
  });
  let accepted = 0;
  for (const row of rows) {
    const claimed = await store.$transaction(async tx => {
      const claim = await tx.replyOutbox.updateMany({
        where: { id: row.id, status: "pending" }, data: { status: "sending", startedAt: new Date(), attempts: { increment: 1 } },
      });
      if (!claim.count) return null;
      const current = await tx.replyOutbox.findUniqueOrThrow({
        where: { id: row.id }, include: { message: { include: { reminder: true } } },
      });
      // Recheck scope after obtaining ownership. Persist the exact text before sending.
      if (current.message.phoneNumberId !== phoneNumberId || current.message.status !== "reply_pending") throw new Error("Resposta fora do contexto esperado.");
      const text = current.refreshReminder && current.message.reminder
        ? formatReminderReply(current.message.reminder) : current.text;
      await tx.replyOutbox.update({ where: { id: row.id }, data: { text } });
      await tx.incomingMessage.update({ where: { id: row.messageId }, data: { status: "reply_sending" } });
      return { phone: current.message.phone, text };
    });
    if (!claimed) continue;
    try {
      const result = await send(claimed.phone, claimed.text);
      const id = (result as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
      if (typeof id !== "string" || !id) throw new Error("Provedor não confirmou identidade da resposta.");
      await store.$transaction(async tx => {
        const marked = await tx.replyOutbox.updateMany({
          where: { id: row.id, status: "sending" },
          data: { status: "provider_accepted", providerMessageId: id, finishedAt: new Date() },
        });
        if (marked.count) await tx.incomingMessage.updateMany({
          where: { id: row.messageId, status: "reply_sending" }, data: { status: "completed", finishedAt: new Date() },
        });
      });
      if (reconcile) {
        try { await reconcile(id); } catch { console.error("Recibo persistido aguarda reconciliação operacional."); }
      }
      accepted++;
    } catch (error) {
      const blocked = error instanceof WhatsAppPreflightError;
      await store.$transaction(async tx => {
        const marked = await tx.replyOutbox.updateMany({
          where: { id: row.id, status: "sending" }, data: { status: blocked ? "blocked_window" : "delivery_unknown", finishedAt: new Date() },
        });
        if (marked.count) await tx.incomingMessage.updateMany({
          where: { id: row.messageId, status: "reply_sending" }, data: { status: blocked ? "reply_blocked" : "reply_unknown", lastError: blocked ? "reply_window_closed" : "reply_delivery_unknown" },
        });
      });
    }
  }
  return accepted;
}
