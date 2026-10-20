import type { PrismaClient, Prisma } from "@prisma/client";
import { ReminderInput, validateReminder } from "./reminder.validation";

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
  const user = await tx.user.upsert({
    where: { phone }, update: {}, create: { phone, name: null, timezone: "America/Sao_Paulo" },
  });
  return tx.reminder.create({
    data: { userId: user.id, title, description, remindAt: reminderDate, status: "scheduling_pending",
      sourceMessageId: source.sourceMessageId, scheduleOutbox: { create: { phoneNumberId: source.phoneNumberId } } },
  });
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
