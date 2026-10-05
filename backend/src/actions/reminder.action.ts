import { createReminder } from "../services/reminder.service";
import { AIInterpretation } from "../types/ai.types";

export async function executeReminderAction(
  phone: string,
  data: AIInterpretation
) {
  if (!data.title || !data.datetime) {
    throw new Error("Dados insuficientes para criar lembrete.");
  }

  return await createReminder({
    phone,
    title: data.title,
    description: data.description || "",
    remindAt: data.datetime,
  });
}