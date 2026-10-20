import type { Prisma } from "@prisma/client";
import { AIInterpretation } from "../types/ai.types";
import { parseTimestamp } from "./reminder.validation";

export const reminderScope = (phone: string, phoneNumberId: string): Prisma.ReminderWhereInput => ({
  user: { phone }, OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }],
});
const displayDate = (date: Date) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
}).format(date);
const displayTitle = (title: string) => title.length > 100 ? title.slice(0, 97) + "..." : title;

export async function manageReminders(phone: string, phoneNumberId: string, intent: AIInterpretation, tx: Prisma.TransactionClient) {
  if (!["list_reminders", "cancel_reminder", "complete_reminder"].includes(intent.action)) return "Ainda não consigo executar essa operação.";
  const scope = reminderScope(phone, phoneNumberId);
  let range: Prisma.DateTimeFilter | undefined;
  if (intent.rangeStart || intent.rangeEnd) {
    try {
      const start = parseTimestamp(intent.rangeStart), end = parseTimestamp(intent.rangeEnd);
      if (start >= end) throw new Error("Intervalo invertido.");
      range = { gte: start, lt: end };
    } catch { return "Qual dia ou período você quer consultar?"; }
  }
  if (intent.action === "list_reminders") {
    const reminders = await tx.reminder.findMany({
      where: { ...scope, state: "active", remindAt: range },
      orderBy: [{ remindAt: "asc" }, { id: "asc" }], take: 11,
    });
    if (!reminders.length) return "Você não tem lembretes pendentes nesse período.";
    return "Seus lembretes pendentes:\n" + reminders.slice(0, 10).map((r, index) =>
      `${index + 1}. ${displayTitle(r.title)} — ${displayDate(r.remindAt)}`).join("\n") +
      (reminders.length > 10 ? "\nMostrei os dez primeiros. Qual período você quer ver?" : "");
  }
  const search = intent.search?.trim() || intent.title?.trim();
  let target;
  if (search) {
    const matches = await tx.reminder.findMany({
      where: { ...scope, state: "active", title: { contains: search, mode: "insensitive" }, remindAt: range },
      orderBy: [{ remindAt: "asc" }, { id: "asc" }], take: 2,
    });
    if (matches.length > 1) return "Qual deles?\n" + matches.map(r => `• ${displayTitle(r.title)} — ${displayDate(r.remindAt)}`).join("\n");
    target = matches[0];
    if (intent.reminderId && target && intent.reminderId !== target.id) return "Não consegui identificar o lembrete com segurança. Qual é o título?";
  } else if (intent.reminderId) {
    target = await tx.reminder.findFirst({ where: { ...scope, id: intent.reminderId } });
  } else return "Qual lembrete você quer " + (intent.action === "cancel_reminder" ? "cancelar?" : "concluir?");
  if (!target) return "Não encontrei esse lembrete entre os seus pendentes.";
  if (target.state === "cancelled") return "Esse lembrete já está cancelado.";
  if (target.state === "completed") return "Esse lembrete já está concluído.";
  const cancellable = ["pending", "scheduled", "scheduling_pending", "scheduling_failed"];
  if (intent.action === "cancel_reminder" && !cancellable.includes(target.status)) return "Esse aviso já entrou em envio. Quer marcar como concluído?";
  const state = intent.action === "cancel_reminder" ? "cancelled" : "completed";
  const changed = await tx.reminder.updateMany({
    where: { ...scope, id: target.id, state: "active", ...(state === "cancelled" ? { status: { in: cancellable } } : {}) },
    data: { state },
  });
  if (!changed.count) return "Esse lembrete mudou enquanto eu processava. Pode confirmar o que deseja?";
  await tx.scheduleOutbox.updateMany({
    where: { reminderId: target.id }, data: { status: "cancelled", leaseToken: null, leaseUntil: null },
  });
  if (state === "cancelled") return `Cancelei o lembrete: ${target.title}.`;
  return `Marquei como concluído: ${target.title}.` +
    (["sending", "delivery_unknown"].includes(target.status) ? " O envio do aviso já tinha começado." : "");
}
