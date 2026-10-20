import type { PrismaClient, Prisma } from "@prisma/client";
import { ReminderInput, validateReminder } from "./reminder.validation";
import { recurrenceDates } from "./recurrence";
import { randomUUID } from "node:crypto";
import { ReminderLimits, ReminderQuotaError, RemindersPausedError, reminderLimits } from "./reminder.limits";

type Store = Pick<PrismaClient, "$transaction" | "reminder">;
type Source = { phoneNumberId: string; sourceMessageId?: string; limits?:ReminderLimits };

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
    // A real upsert update locks the user row through the quota check and inserts.
    where: { phone }, update: {updatedAt:new Date()}, create: { phone, name: null, timezone: "America/Sao_Paulo" },
  });
  if (source.sourceMessageId) {
    const existing = await tx.reminder.findUnique({where:{sourceMessageId:source.sourceMessageId}});
    if (existing) return existing;
  }
  const preference = await tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:source.phoneNumberId,phone}}});
  if(preference?.remindersPaused)throw new RemindersPausedError();
  const limits = source.limits ?? reminderLimits();
  const scope = {userId:user.id,OR:[{sourceMessage:{phoneNumberId:source.phoneNumberId}},{scheduleOutbox:{phoneNumberId:source.phoneNumberId}}]};
  const [active, recent] = await Promise.all([
    tx.reminder.count({where:{...scope,state:"active"}}),
    tx.reminder.count({where:{...scope,createdAt:{gte:new Date(Date.now()-24*60*60000)}}}),
  ]);
  if (active + dates.length > limits.active) throw new ReminderQuotaError(`Você atingiu o limite de ${limits.active} lembretes pendentes. Conclua ou cancele alguns antes de criar novos.`);
  if (recent + dates.length > limits.perDay) throw new ReminderQuotaError(`O limite de criação é de ${limits.perDay} avisos em 24 horas. Tente novamente quando os avisos mais antigos saírem desse período.`);
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
