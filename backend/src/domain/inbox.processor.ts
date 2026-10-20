import type { PrismaClient, IncomingMessage } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ConversationDependencies, prepareConversation } from "./conversation.processor";
import { parseInterpretation } from "./interpretation.validation";
import { executeAction } from "./action.executor";
import { persistReminderInTransaction } from "./reminder.creator";
import { schedulingBackoff } from "./schedule.relay";
import { manageReminders } from "./reminder.management";

type Store = Pick<PrismaClient, "incomingMessage" | "$transaction">;
const leaseMs = 120_000;

async function saveFailure(store: Store, id: string, token: string, phase: "interpreting" | "executing", attempt: number, max: number) {
  await store.incomingMessage.updateMany({
    where: { id, status: phase, leaseToken: token },
    data: {
      status: attempt >= max ? "failed" : phase === "interpreting" ? "received" : "interpreted",
      nextAttemptAt: new Date(Date.now() + schedulingBackoff(attempt)),
      leaseToken: null, leaseUntil: null, lastError: phase + "_failed",
      finishedAt: attempt >= max ? new Date() : null,
    },
  });
}

async function prepareIntent(store: Store, row: IncomingMessage, deps: ConversationDependencies) {
  if (row.interpretationAttempts >= row.maxAttempts) {
    await store.incomingMessage.updateMany({
      where: { id: row.id, status: row.status, leaseToken: row.leaseToken, interpretationAttempts: row.interpretationAttempts },
      data: { status: "failed", lastError: "interpretation_attempt_limit", leaseToken: null, leaseUntil: null, finishedAt: new Date() },
    });
    return;
  }
  const token = randomUUID();
  const now = new Date();
  const claim = await store.incomingMessage.updateMany({
    where: { id: row.id, interpretationAttempts: row.interpretationAttempts,
      OR: [{ status: "received", nextAttemptAt: { lte: now } }, { status: "interpreting", leaseUntil: { lte: now } }] },
    data: { status: "interpreting", startedAt: now, interpretationAttempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  if (!claim.count) return;
  try {
    const result = await prepareConversation(row, deps);
    await store.incomingMessage.updateMany({
      where: { id: row.id, status: "interpreting", leaseToken: token },
      data: { interpretation: JSON.parse(JSON.stringify(result)), status: "interpreted", nextAttemptAt: new Date(),
        leaseToken: null, leaseUntil: null, lastError: null },
    });
  } catch {
    await saveFailure(store, row.id, token, "interpreting", row.interpretationAttempts + 1, row.maxAttempts);
  }
}

async function prepareAction(store: Store, row: IncomingMessage) {
  if (row.executionAttempts >= row.maxAttempts) {
    await store.incomingMessage.updateMany({
      where: { id: row.id, status: row.status, leaseToken: row.leaseToken, executionAttempts: row.executionAttempts },
      data: { status: "failed", lastError: "execution_attempt_limit", leaseToken: null, leaseUntil: null, finishedAt: new Date() },
    });
    return false;
  }
  const token = randomUUID();
  const now = new Date();
  const claim = await store.incomingMessage.updateMany({
    where: { id: row.id, executionAttempts: row.executionAttempts,
      OR: [{ status: "interpreted", nextAttemptAt: { lte: now } }, { status: "executing", leaseUntil: { lte: now } }] },
    data: { status: "executing", executionAttempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  if (!claim.count) return false;
  try {
    return await store.$transaction(async tx => {
      // This write locks the row for the whole DB-only action. A reclaimed worker
      // cannot commit another action or change ownership while this transaction runs.
      const owned = await tx.incomingMessage.updateMany({
        where: { id: row.id, status: "executing", leaseToken: token },
        data: { leaseUntil: new Date(Date.now() + leaseMs) },
      });
      if (!owned.count) return false;
      const interpretation = parseInterpretation(JSON.stringify(row.interpretation));
      let refreshReminder = false;
      const reply = await executeAction(row.phone, interpretation, async input => {
        const reminder = await persistReminderInTransaction(input, tx, { phoneNumberId: row.phoneNumberId, sourceMessageId: row.id });
        refreshReminder = true;
        return reminder;
      }, intent => manageReminders(row.phone, row.phoneNumberId, intent, tx));
      await tx.replyOutbox.create({ data: { messageId: row.id, text: reply, refreshReminder } });
      await tx.incomingMessage.update({
        where: { id: row.id }, data: { status: "reply_pending", leaseToken: null, leaseUntil: null, lastError: null },
      });
      return true;
    });
  } catch {
    await saveFailure(store, row.id, token, "executing", row.executionAttempts + 1, row.maxAttempts);
    return false;
  }
}

export async function processInboxBatch(store: Store, deps: ConversationDependencies, phoneNumberId: string) {
  const now = new Date();
  const rows = await store.incomingMessage.findMany({
    where: { phoneNumberId, OR: [
      { status: { in: ["received", "interpreted"] }, nextAttemptAt: { lte: now } },
      { status: { in: ["interpreting", "executing"] }, leaseUntil: { lte: now } },
    ] },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: 20,
  });
  let prepared = 0;
  for (const initial of rows) {
    if (initial.status === "received" || initial.status === "interpreting") await prepareIntent(store, initial, deps);
    const row = await store.incomingMessage.findUnique({ where: { id: initial.id } });
    if (row && (row.status === "interpreted" || (row.status === "executing" && row.leaseUntil && row.leaseUntil <= new Date()))) {
      if (await prepareAction(store, row)) prepared++;
    }
  }
  return prepared;
}
