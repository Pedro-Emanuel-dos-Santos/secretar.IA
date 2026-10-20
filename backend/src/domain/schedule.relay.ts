import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

type Store = Pick<PrismaClient, "scheduleOutbox" | "reminder" | "$transaction">;
export type ReminderQueue = { add(name: string, data: any, options: any): Promise<unknown> };
type Options = { phoneNumberId: string; reminderId?: string; now?: Date; publishTimeoutMs?: number };
const leaseMs = 120_000;
export const schedulingBackoff = (attempt: number) => Math.min(900_000, 30_000 * 2 ** (attempt - 1));

async function boundedPublish(publish: Promise<unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([publish, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Publicação sem confirmação no prazo.")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function relaySchedules(store: Store, queue: ReminderQueue, options: Options) {
  const now = options.now ?? new Date();
  const rows = await store.scheduleOutbox.findMany({
    where: {
      phoneNumberId: options.phoneNumberId, reminderId: options.reminderId,
      OR: [{ status: "pending", nextAttemptAt: { lte: now } }, { status: "publishing", leaseUntil: { lte: now } }],
    },
    include: { reminder: { include: { user: true } } }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: 20,
  });
  let published = 0;
  for (const row of rows) {
    const version = row.reminder.scheduleVersion;
    if (row.attempts >= row.maxAttempts) {
      await store.$transaction(async tx => {
        const failed = await tx.scheduleOutbox.updateMany({
          where: { id: row.id, status: row.status, attempts: row.attempts, leaseToken: row.leaseToken, reminder: { scheduleVersion: version } },
          data: { status: "failed", leaseToken: null, leaseUntil: null, lastError: "attempt_limit_or_publish_unknown" },
        });
        if (failed.count) await tx.reminder.updateMany({
          where: { id: row.reminderId, scheduleVersion: version, status: "scheduling_pending" }, data: { status: "scheduling_failed" },
        });
      });
      continue;
    }
    const token = randomUUID();
    const attempt = row.attempts + 1;
    const claim = await store.scheduleOutbox.updateMany({
      where: {
        id: row.id, attempts: row.attempts, reminder: { scheduleVersion: version },
        OR: [{ status: "pending", nextAttemptAt: { lte: now } }, { status: "publishing", leaseUntil: { lte: now } }],
      },
      data: { status: "publishing", attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + leaseMs) },
    });
    if (!claim.count) continue;
    try {
      await boundedPublish(queue.add("send-reminder", {
        reminderId: row.reminderId,
        scheduleVersion: version,
      }, {
        delay: Math.max(0, row.reminder.remindAt.getTime() - Date.now()), jobId: version ? `${row.reminderId}-v${version}` : row.reminderId,
        removeOnComplete: false, removeOnFail: false,
      }), options.publishTimeoutMs ?? 5000);
      await store.$transaction(async tx => {
        const marked = await tx.scheduleOutbox.updateMany({
          where: { id: row.id, status: "publishing", leaseToken: token },
          data: { status: "published", leaseToken: null, leaseUntil: null, lastError: null },
        });
        if (marked.count) await tx.reminder.updateMany({
          where: { id: row.reminderId, scheduleVersion: version, status: "scheduling_pending" }, data: { status: "scheduled" },
        });
      });
      published++;
    } catch {
      // add() may have succeeded before a connection/DB failure. Stable job ID plus
      // a persisted send claim protects the external effect when publication is repeated.
      await store.$transaction(async tx => {
        const failed = attempt >= row.maxAttempts;
        const updated = await tx.scheduleOutbox.updateMany({
          where: { id: row.id, status: "publishing", leaseToken: token },
          data: {
            status: failed ? "failed" : "pending", leaseToken: null, leaseUntil: null,
            nextAttemptAt: new Date(now.getTime() + schedulingBackoff(attempt)), lastError: "publish_not_confirmed",
          },
        });
        if (updated.count && failed) await tx.reminder.updateMany({
          where: { id: row.reminderId, scheduleVersion: version, status: "scheduling_pending" }, data: { status: "scheduling_failed" },
        });
      });
    }
  }
  return published;
}
