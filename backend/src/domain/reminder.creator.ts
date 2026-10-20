import type { PrismaClient, Prisma } from "@prisma/client";
import { ReminderInput, validateReminder } from "./reminder.validation";
import { recurrenceDates } from "./recurrence";
import { randomUUID } from "node:crypto";

type Store = Pick<PrismaClient, "$transaction" | "reminder">;
type Source = { phoneNumberId: string; sourceMessageId?: string };

export async function persistReminderInTransaction(input: ReminderInput, tx: Prisma.TransactionClient, source: Source) {
  if (!source.phoneNumberId) throw new Error("Configure o número comercial.");
  if (source.sourceMessageId) {
    const incoming = await tx.incomingMessage.findUnique({ where: { id: source.sourceMessageId } });
    if (!incoming || incoming.phone !== input.phone || incoming.phoneNumberId !== source.phoneNumberId) throw new Error("Mensagem de origem incompatível.");
    const existing = await tx.reminder.findUnique({ where: { sourceMessageId: source.sourceMessageId } });
    if (existing) return existing;
  }
  const { phone, title, description, reminderDate } = validateReminder(input);
  const dates = recurrenceDates(input.remindAt, input.recurrence);
  const user = await tx.user.upsert({
    where: { phone }, update: {}, create: { phone, name: null, timezone: "America/Sao_Paulo" },
  });
  const seriesId = input.recurrence ? randomUUID() : null;
  const recurrence = input.recurrence ? { seriesId, occurrenceIndex: 0,
    recurrenceFrequency: input.recurrence.frequency, recurrenceCount: input.recurrence.count } : {};
  const first = await tx.reminder.create({
    data: { userId: user.id, title, description, remindAt: reminderDate, status: "scheduling_pending",
      ...recurrence,
      sourceMessageId: source.sourceMessageId, scheduleOutbox: { create: { phoneNumberId: source.phoneNumberId } } },
  });
  for (let index = 1; index < dates.length; index++) await tx.reminder.create({
    data: { userId: user.id, title, description, remindAt: dates[index], status: "scheduling_pending",
      ...recurrence, occurrenceIndex: index, scheduleOutbox: { create: { phoneNumberId: source.phoneNumberId } } },
  });
  return first;
}

export async function persistReminder(input: ReminderInput, store: Store, source: Source) {
  try {
    return await store.$transaction(tx => persistReminderInTransaction(input, tx, source));
  } catch (error) {
    if (source.sourceMessageId && (error as { code?: string }).code === "P2002") {
      const existing = await store.reminder.findFirst({
        where: { sourceMessageId: source.sourceMessageId, user: { phone: input.phone },
          sourceMessage: { phoneNumberId: source.phoneNumberId } },
      });
      if (existing) return existing;
    }
    throw error;
  }
}
