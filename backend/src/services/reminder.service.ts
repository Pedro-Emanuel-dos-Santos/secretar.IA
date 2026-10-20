import { prisma } from "../config/prisma";
import { reminderQueue } from "../queue/reminder.queue";
import { ReminderInput } from "../domain/reminder.validation";
import { persistReminder } from "../domain/reminder.creator";
import { relaySchedules } from "../domain/schedule.relay";

export async function createReminder(data: ReminderInput, sourceMessageId?: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("Configure WHATSAPP_PHONE_NUMBER_ID.");
  const reminder = await persistReminder(data, prisma, { phoneNumberId, sourceMessageId });
  try { await relaySchedules(prisma, reminderQueue, { phoneNumberId, reminderId: reminder.id }); }
  catch { console.error("Publicação não confirmada; agendamento preservado no banco."); }
  return (await prisma.reminder.findUnique({ where: { id: reminder.id } })) ?? reminder;
}
