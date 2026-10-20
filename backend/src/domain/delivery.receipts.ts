import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

type Receipt = { providerMessageId: string; status: string; timestamp: string; phone: string; errorCodes: number[] };
export function extractDeliveryReceipts(payload: any, phoneNumberId: string): Receipt[] {
  const receipts: Receipt[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== "messages" || value?.metadata?.phone_number_id !== phoneNumberId) continue;
      for (const row of Array.isArray(value.statuses) ? value.statuses : []) {
        if (typeof row?.id !== "string" || !row.id || row.id.length > 512 ||
            !["sent", "delivered", "read", "failed", "deleted"].includes(row.status) ||
            typeof row.recipient_id !== "string" || !/^\d{8,15}$/.test(row.recipient_id) ||
            typeof row.timestamp !== "string" || !/^\d{1,12}$/.test(row.timestamp)) continue;
        receipts.push({ providerMessageId: row.id, status: row.status, timestamp: row.timestamp, phone: row.recipient_id,
          errorCodes: (Array.isArray(row.errors) ? row.errors : []).map((e: any) => e?.code).filter((code: unknown) => Number.isSafeInteger(code)).slice(0, 10) });
      }
    }
  }
  return receipts;
}

export async function receiveDeliveryReceipts(payload: unknown, phoneNumberId: string, store: PrismaClient) {
  for (const receipt of extractDeliveryReceipts(payload, phoneNumberId)) {
    // Only retain statuses for a person who has actually messaged this business.
    const known = await store.incomingMessage.findFirst({ where: { phone: receipt.phone, phoneNumberId }, select: { id: true } });
    if (!known) continue;
    const { phone, ...safe } = receipt;
    const id = createHash("sha256").update(JSON.stringify([phoneNumberId, safe.providerMessageId, safe.status, safe.timestamp])).digest("hex");
    await store.$transaction(async tx => {
      const user = await tx.user.upsert({ where: { phone }, update: {}, create: { phone } });
      await tx.event.upsert({ where: { id }, update: {}, create: {
        id, userId: user.id, type: "whatsapp_delivery", source: "meta", payload: { ...safe, phoneNumberId },
      } });
      // Receipts may arrive out of order. Never turn a read/delivered message back into sent/failed.
      const predecessors: Record<string, string[]> = {
        sent: ["sent"], failed: ["sent", "failed"], delivered: ["sent", "failed", "delivered"], read: ["sent", "failed", "delivered", "read"],
      };
      const allowed = predecessors[receipt.status];
      if (!allowed) return;
      const receivedAt = new Date(Number(receipt.timestamp) * 1000);
      const progress = {
        providerMessageId: receipt.providerMessageId,
        AND: [
          { OR: [{ deliveryStatus: null }, { deliveryStatus: { in: allowed } }] },
          { OR: [{ deliveryUpdatedAt: null }, { deliveryUpdatedAt: { lte: receivedAt } }] },
        ],
      };
      const data = { deliveryStatus: receipt.status, deliveryErrorCodes: receipt.errorCodes, deliveryUpdatedAt: receivedAt };
      await tx.reminder.updateMany({ where: {
        ...progress, user: { phone }, OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }],
      }, data });
      await tx.replyOutbox.updateMany({ where: { ...progress, message: { phone, phoneNumberId } }, data });
    });
  }
}

// A receipt can beat the HTTP send response. Reapply already-persisted receipts after
// recording the provider ID, so an early read/failed receipt is not lost in the summary.
export async function reconcileStoredDelivery(store: PrismaClient, phoneNumberId: string, providerMessageId: string) {
  const events = await store.event.findMany({
    where: { type: "whatsapp_delivery", AND: [
      { payload: { path: ["phoneNumberId"], equals: phoneNumberId } },
      { payload: { path: ["providerMessageId"], equals: providerMessageId } },
    ] }, include: { user: { select: { phone: true } } }, orderBy: { createdAt: "asc" }, take: 20,
  });
  for (const event of events) {
    const receipt = event.payload as { status: string; timestamp: string; errorCodes: number[] };
    await receiveDeliveryReceipts({ entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: phoneNumberId }, statuses: [{ id: providerMessageId, status: receipt.status,
        timestamp: receipt.timestamp, recipient_id: event.user.phone, errors: receipt.errorCodes.map(code => ({ code })) }],
    } }] }] }, phoneNumberId, store);
  }
}
