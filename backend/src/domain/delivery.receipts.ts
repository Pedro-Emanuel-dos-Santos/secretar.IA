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
    });
  }
}
