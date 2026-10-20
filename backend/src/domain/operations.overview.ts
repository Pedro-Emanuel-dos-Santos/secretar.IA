import type { PrismaClient } from "@prisma/client";
type Store = Pick<PrismaClient, "incomingMessage" | "replyOutbox" | "scheduleOutbox" | "reminder">;

export async function operationalOverview(store: Store, phoneNumberId: string) {
  const now = new Date();
  const stalled = new Date(now.getTime() - 120000);
  const [inbox, replies, schedules, reminders, expiredPreparation, uncertainReplies, legacyProcessing, uncertainReminders, reminderStates, deliveryStates, replyDeliveryStates, unreadableAudio, failedRequests, limitedRequests] = await Promise.all([
    store.incomingMessage.groupBy({ by: ["status"], where: { phoneNumberId }, _count: { _all: true } }),
    store.replyOutbox.groupBy({ by: ["status"], where: { message: { phoneNumberId } }, _count: { _all: true } }),
    store.scheduleOutbox.groupBy({ by: ["status"], where: { phoneNumberId }, _count: { _all: true } }),
    store.reminder.groupBy({ by: ["status"], where: { OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }] }, _count: { _all: true } }),
    store.incomingMessage.count({ where: { phoneNumberId, status: { in: ["interpreting", "executing"] }, leaseUntil: { lte: now } } }),
    store.replyOutbox.count({ where: { message: { phoneNumberId }, OR: [
      { status: "delivery_unknown" }, { status: "sending", startedAt: { lte: stalled } }, { status: "sending", startedAt: null },
    ] } }),
    store.incomingMessage.count({ where: { phoneNumberId, status: { in: ["processing", "processing_unknown"] } } }),
    store.reminder.count({ where: {
      OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }],
      AND: [{ OR: [{ status: "delivery_unknown" }, { status: "sending", deliveryStartedAt: { lte: stalled } },
        { status: "sending", deliveryStartedAt: null }] }],
    } }),
    store.reminder.groupBy({ by: ["state"], where: { OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }] }, _count: { _all: true } }),
    store.reminder.groupBy({ by: ["deliveryStatus"], where: { OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }] }, _count: { _all: true } }),
    store.replyOutbox.groupBy({ by: ["deliveryStatus"], where: { message: { phoneNumberId } }, _count: { _all: true } }),
    store.incomingMessage.count({where:{phoneNumberId,lastError:"audio_unreadable"}}),
    store.incomingMessage.count({where:{phoneNumberId,lastError:{in:["interpreting_attempt_limit","executing_attempt_limit"]}}}),
    store.incomingMessage.count({where:{phoneNumberId,lastError:"request_quota"}}),
  ]);
  const counts = (rows: { status: string; _count: { _all: number } }[]) =>
    Object.fromEntries(rows.map(row => [row.status, row._count._all]));
  return {
    inbox: counts(inbox), replies: counts(replies), schedules: counts(schedules), reminders: counts(reminders),
    reminderStates: Object.fromEntries(reminderStates.map(row => [row.state, row._count._all])),
    delivery: {
      reminders: Object.fromEntries(deliveryStates.map(row => [row.deliveryStatus ?? "not_confirmed", row._count._all])),
      replies: Object.fromEntries(replyDeliveryStates.map(row => [row.deliveryStatus ?? "not_confirmed", row._count._all])),
    },
    attention: { expiredPreparation, uncertainReplies, legacyProcessing,
      unreadableAudio, failedRequests, limitedRequests,
      failedMessages: counts(inbox).failed ?? 0, failedSchedules: counts(schedules).failed ?? 0,
      uncertainReminders, blockedTemplates: counts(reminders).blocked_template ?? 0, blockedReplies: counts(replies).blocked_window ?? 0,
      pausedReminders: counts(reminders).blocked_paused ?? 0, missedReminders: counts(reminders).missed ?? 0,
      rejectedReminders: counts(reminders).provider_rejected ?? 0, rejectedReplies: counts(replies).provider_rejected ?? 0,
      failedDeliveries: deliveryStates.find(row => row.deliveryStatus === "failed")?._count._all ?? 0 },
  };
}
