import type { PrismaClient } from "@prisma/client";
import { formatReminderReply } from "./action.executor";
import { WhatsAppPreflightError } from "./whatsapp.policy";
import { WhatsAppSendRejected } from "./whatsapp.errors";

type Store = Pick<PrismaClient, "replyOutbox" | "$transaction">;
type Sender = (phone: string, text: string) => Promise<unknown>;

export async function relayReplies(store: Store, send: Sender, phoneNumberId: string,
  reconcile?: (providerMessageId: string) => Promise<void>, shouldStop=()=>false) {
  let accepted = 0;
  const visitedIds: string[] = [];
  const blockedPhones: string[] = [];
  for (let page = 0; page < 5 && visitedIds.length < 100; page++) {
  const rows = await store.replyOutbox.findMany({
    where: { id: { notIn: visitedIds }, status: "pending", message: { phoneNumberId, phone: { notIn: blockedPhones }, status: "reply_pending" } },
    include: { message: { select: { phone: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20,
  });
  if (!rows.length) break;
  for (const row of rows) {
    if (shouldStop()) break;
    visitedIds.push(row.id);
    const claimed = await store.$transaction(async tx => {
      // Serialize the claim, not the HTTP request. The persisted sending state
      // keeps another instance from overtaking this conversation after commit.
      const conversation = JSON.stringify([phoneNumberId, row.message.phone]);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${conversation}, 0))::text`;
      const current = await tx.replyOutbox.findUniqueOrThrow({
        where: { id: row.id }, include: { message: { include: { reminder: {include:{subject:{select:{name:true}}}} } } },
      });
      if (current.status !== "pending") return null;
      const earlier = await tx.replyOutbox.findFirst({ where: {
        message: { phoneNumberId, phone: current.message.phone },
        OR: [
          { status: "sending" },
          { status: "pending", message: { OR: [
            { receivedAt: { lt: current.message.receivedAt } },
            { receivedAt: current.message.receivedAt, id: { lt: current.message.id } },
          ] } },
        ],
      }, select: { id: true } });
      if (earlier) return null;
      // delivery_unknown is terminal and requires operational reconciliation;
      // do not retry it or block all future replies indefinitely.
      const claim = await tx.replyOutbox.updateMany({
        where: { id: row.id, status: "pending" }, data: { status: "sending", startedAt: new Date(), attempts: { increment: 1 } },
      });
      if (!claim.count) return null;
      // Recheck scope after obtaining ownership. Persist the exact text before sending.
      if (current.message.phoneNumberId !== phoneNumberId || current.message.status !== "reply_pending") throw new Error("Resposta fora do contexto esperado.");
      const text = current.refreshReminder && current.message.reminder
        ? formatReminderReply(current.message.reminder) : current.text;
      await tx.replyOutbox.update({ where: { id: row.id }, data: { text } });
      await tx.incomingMessage.update({ where: { id: row.messageId }, data: { status: "reply_sending" } });
      return { phone: current.message.phone, text };
    });
    if (!claimed) { blockedPhones.push(row.message.phone); continue; }
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
      const rejected = error instanceof WhatsAppSendRejected;
      await store.$transaction(async tx => {
        const marked = await tx.replyOutbox.updateMany({
          where: { id: row.id, status: "sending" }, data: { status: blocked ? "blocked_window" : rejected ? "provider_rejected" : "delivery_unknown", finishedAt: new Date(),
            ...(rejected ? {deliveryStatus:"failed",deliveryErrorCodes:error.code === undefined ? [] : [error.code],deliveryUpdatedAt:new Date()} : {}),
          },
        });
        if (marked.count) await tx.incomingMessage.updateMany({
          where: { id: row.messageId, status: "reply_sending" }, data: { status: blocked ? "reply_blocked" : rejected ? "reply_rejected" : "reply_unknown", lastError: blocked ? "reply_window_closed" : rejected ? "reply_provider_rejected" : "reply_delivery_unknown" },
        });
      });
    }
  }
  if (shouldStop() || !blockedPhones.length) break;
  }
  return accepted;
}
