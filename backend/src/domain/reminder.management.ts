import { Prisma } from "@prisma/client";
import { AIInterpretation } from "../types/ai.types";
import { parseTimestamp, validateReminder } from "./reminder.validation";

export const reminderScope = (phone: string, phoneNumberId: string): Prisma.ReminderWhereInput => ({
  user: { phone }, OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }],
});
const displayDate = (date: Date) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
}).format(date);
const displayTitle = (title: string) => title.length > 100 ? title.slice(0, 97) + "..." : title;

export async function manageReminders(phone: string, phoneNumberId: string, intent: AIInterpretation, tx: Prisma.TransactionClient) {
  if (!["list_reminders", "cancel_reminder", "complete_reminder", "reschedule_reminder"].includes(intent.action)) return "Ainda não consigo executar essa operação.";
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
      orderBy: [{ remindAt: "asc" }, { id: "asc" }], take: intent.cancelSeries ? 13 : 2,
    });
    if (matches.length > 1 && !(intent.cancelSeries && matches[0].seriesId && matches.every(r => r.seriesId === matches[0].seriesId))) return "Qual deles?\n" + matches.map(r => `• ${displayTitle(r.title)} — ${displayDate(r.remindAt)}`).join("\n");
    target = matches[0];
    if (intent.reminderId && target && intent.reminderId !== target.id) return "Não consegui identificar o lembrete com segurança. Qual é o título?";
  } else if (intent.reminderId) {
    target = await tx.reminder.findFirst({ where: { ...scope, id: intent.reminderId } });
  } else return "Qual lembrete você quer " + (intent.action === "cancel_reminder" ? "cancelar?" : intent.action === "reschedule_reminder" ? "reagendar?" : "concluir?");
  if (!target) return "Não encontrei esse lembrete entre os seus pendentes.";
  if (intent.expectedVersion !== undefined && target.scheduleVersion !== intent.expectedVersion) {
    return "Esse botão é de um aviso antigo. Use o aviso mais recente ou me diga o que deseja alterar.";
  }
  if (target.state === "cancelled") return "Esse lembrete já está cancelado.";
  if (target.state === "completed") return "Esse lembrete já está concluído.";
  const cancellable = ["pending", "scheduled", "scheduling_pending", "scheduling_failed", "blocked_template"];
  if (intent.cancelSeries) {
    if (intent.action !== "cancel_reminder") return "Posso cancelar os próximos avisos da série. Para adiar ou concluir, escolha um aviso.";
    if (!target.seriesId) return "Esse lembrete não pertence a uma série.";
    // Status is rechecked atomically: cancellation must never claim to undo a send
    // that won the race. No new occurrences are generated after this transaction.
    const cancelled = await tx.reminder.updateMany({
      where: { ...scope, seriesId: target.seriesId, state: "active", status: { in: cancellable } }, data: { state: "cancelled" },
    });
    await tx.scheduleOutbox.updateMany({ where: { phoneNumberId, reminder: { ...scope, seriesId: target.seriesId, state: "cancelled" } },
      data: { status: "cancelled", leaseToken: null, leaseUntil: null } });
    return `Cancelei ${cancelled.count} próximos avisos da série ${target.title}. Avisos cujo envio já começou não são desfeitos.`;
  }
  if (intent.action === "reschedule_reminder") {
    if (!intent.datetime) return "Para qual dia e horário você quer mudar esse lembrete?";
    let reminderDate: Date;
    try { reminderDate = validateReminder({ phone, title: target.title, remindAt: intent.datetime }).reminderDate; }
    catch { return "Preciso de uma data e horário válidos no futuro. Quando devo te lembrar?"; }
    const reschedulable = [...cancellable, "provider_accepted"];
    if (!reschedulable.includes(target.status)) return "Esse aviso já entrou em envio. Ainda não consigo confirmar o resultado para reagendar com segurança.";
    const changed = await tx.reminder.updateMany({
      where: { ...scope, id: target.id, state: "active", scheduleVersion: target.scheduleVersion, status: { in: reschedulable } },
      data: { remindAt: reminderDate, scheduleVersion: { increment: 1 }, status: "scheduling_pending",
        providerMessageId: null, deliveryStartedAt: null, deliveryStatus: null, deliveryUpdatedAt: null,
        deliveryErrorCodes: Prisma.DbNull },
    });
    if (!changed.count) return "Esse lembrete mudou enquanto eu processava. Pode confirmar o que deseja?";
    await tx.event.create({ data: {
      userId: target.userId, type: "reminder_rescheduled", source: "secretaria",
      payload: { reminderId: target.id, phoneNumberId, previousVersion: target.scheduleVersion,
        previousProviderMessageId: target.providerMessageId, previousDeliveryStatus: target.deliveryStatus,
        previousRemindAt: target.remindAt.toISOString(), remindAt: reminderDate.toISOString() },
    } });
    await tx.scheduleOutbox.upsert({
      where: { reminderId: target.id },
      create: { reminderId: target.id, phoneNumberId },
      update: { status: "pending", attempts: 0, nextAttemptAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null },
    });
    return `Alterei o horário de ${target.title} para ${displayDate(reminderDate)}. O novo agendamento ainda está sendo confirmado.`;
  }
  if (intent.action === "cancel_reminder" && !cancellable.includes(target.status)) return "Esse aviso já entrou em envio. Quer marcar como concluído?";
  const state = intent.action === "cancel_reminder" ? "cancelled" : "completed";
  const changed = await tx.reminder.updateMany({
    where: { ...scope, id: target.id, state: "active", scheduleVersion: target.scheduleVersion, ...(state === "cancelled" ? { status: { in: cancellable } } : {}) },
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
