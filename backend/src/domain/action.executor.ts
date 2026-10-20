import { AIInterpretation } from "../types/ai.types";
import { ReminderInput, validateReminder } from "./reminder.validation";

type CreateReminder = (data: ReminderInput) => Promise<{ title: string; remindAt: Date; status?: string; state?: string }>;

export function formatReminderReply(reminder: { title: string; remindAt: Date; status?: string; state?: string }) {
  if (reminder.state === "cancelled") return "Esse lembrete está cancelado.";
  if (reminder.state === "completed") return "Esse lembrete já está concluído.";
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(reminder.remindAt);
  if (reminder.status === "scheduling_pending" || reminder.status === "scheduling_failed") {
    return `Registrei: ${reminder.title}, em ${date}. O agendamento ainda não foi confirmado.`;
  }
  if (reminder.status === "sending" || reminder.status === "delivery_unknown") return "O lembrete já entrou em envio. Ainda não consigo confirmar o resultado.";
  if (reminder.status === "provider_accepted") return "Esse lembrete já foi aceito pelo provedor para envio.";
  return `Combinado. Em ${date}, eu te lembro de: ${reminder.title}.`;
}

export async function executeAction(phone: string, interpretation: AIInterpretation, create: CreateReminder,
  manage?: (intent: AIInterpretation) => Promise<string>): Promise<string> {
  switch (interpretation.action) {
    case "create_reminder": {
      if (!interpretation.title?.trim()) return "Do que você quer que eu te lembre?";
      if (!interpretation.datetime) return "Em qual dia e horário?";
      const input = { phone, title: interpretation.title, description: interpretation.description ?? undefined, remindAt: interpretation.datetime };
      try { validateReminder(input); } catch {
        return "Preciso de uma data e horário válidos no futuro. Quando devo te lembrar?";
      }
      const reminder = await create(input);
      return formatReminderReply(reminder);
    }
    case "list_reminders":
    case "cancel_reminder":
    case "complete_reminder":
      return manage ? manage(interpretation) : "Ainda não consigo executar essa operação por aqui.";
    case "create_expense": return "Ainda não consigo registrar gastos.";
    case "unknown": return "Não entendi o que você precisa. Pode explicar de outro jeito?";
    case "conversation": return interpretation.reply;
    default: return "Ainda não consigo executar essa ação.";
  }
}
