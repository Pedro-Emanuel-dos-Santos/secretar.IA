import { AIInterpretation } from "../types/ai.types";
import { ReminderInput, validateReminder } from "./reminder.validation";
import { recurrenceDates, recurrenceSummary } from "./recurrence";
import { ReminderQuotaError, RemindersPausedError } from "./reminder.limits";

type CreateReminder = (data: ReminderInput) => Promise<{ title: string; remindAt: Date; status?: string; state?: string }>;

export function formatReminderReply(reminder: { title: string; remindAt: Date; status?: string; state?: string; recurrenceFrequency?: string | null; recurrenceCount?: number | null }) {
  if (reminder.state === "cancelled") return "Esse lembrete está cancelado.";
  if (reminder.state === "completed") return "Esse lembrete já está concluído.";
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(reminder.remindAt);
  if (reminder.status === "scheduling_pending" || reminder.status === "scheduling_failed") {
    return `Registrei: ${reminder.title}, em ${date}. O agendamento ainda não foi confirmado.` + recurrenceSummary(reminder);
  }
  if (reminder.status === "sending" || reminder.status === "delivery_unknown") return "O lembrete já entrou em envio. Ainda não consigo confirmar o resultado.";
  if (reminder.status === "provider_accepted") return "Esse lembrete já foi aceito pelo provedor para envio.";
  if (reminder.status === "blocked_template") return "O lembrete foi registrado, mas o envio está bloqueado até configurar um modelo aprovado pelo WhatsApp.";
  if (reminder.status === "blocked_paused") return "Esse aviso não foi enviado porque seus lembretes estavam pausados. Pode reagendá-lo se precisar.";
  if (reminder.status === "missed") return "Esse aviso venceu durante uma indisponibilidade e não foi enviado. Pode reagendá-lo se precisar.";
  if (reminder.status === "provider_rejected") return "O WhatsApp recusou esse aviso. Ele não foi confirmado como enviado; é preciso verificar o motivo antes de tentar novamente.";
  return `Combinado. Em ${date}, eu te lembro de: ${reminder.title}.` + recurrenceSummary(reminder);
}

export async function executeAction(phone: string, interpretation: AIInterpretation, create: CreateReminder,
  manage?: (intent: AIInterpretation) => Promise<string>, notes?: (intent:AIInterpretation)=>Promise<string>): Promise<string> {
  switch (interpretation.action) {
    case "create_reminder": {
      if (!interpretation.title?.trim()) return "Do que você quer que eu te lembre?";
      if (!interpretation.datetime) return interpretation.draft?.date ? "Que horas você quer que eu te lembre?"
        : interpretation.draft?.time ? "Em qual dia você quer esse lembrete?" : "Em qual dia e horário?";
      if (interpretation.recurrence && !interpretation.recurrence.count) return "Quantos avisos você quer nessa série? Posso preparar de 2 a 12.";
      const recurrence = interpretation.recurrence ? { frequency: interpretation.recurrence.frequency, count: interpretation.recurrence.count! } : undefined;
      const input = { phone, title: interpretation.title, description: interpretation.description ?? undefined, remindAt: interpretation.datetime, recurrence };
      try { validateReminder(input); recurrenceDates(input.remindAt, recurrence); } catch {
        return "Preciso de uma data e horário válidos no futuro. Quando devo te lembrar?";
      }
      try {
        const reminder = await create(input);
        return formatReminderReply(reminder);
      } catch (error) {
        if (error instanceof ReminderQuotaError || error instanceof RemindersPausedError) return error.reply;
        throw error;
      }
    }
    case "list_reminders":
    case "cancel_reminder":
    case "complete_reminder":
    case "reschedule_reminder":
      return manage ? manage(interpretation) : "Ainda não consigo executar essa operação por aqui.";
    case "create_expense": return "Ainda não consigo registrar gastos.";
    case "save_note":
    case "search_notes": return notes ? notes(interpretation) : "As anotações ainda não estão disponíveis aqui.";
    case "discard_draft": return "Tudo bem, deixei esse pedido em aberto de lado. Os lembretes já salvos continuam como estavam.";
    case "unknown": return "Não entendi o que você precisa. Pode explicar de outro jeito?";
    case "conversation": return interpretation.reply;
    default: return "Ainda não consigo executar essa ação.";
  }
}
