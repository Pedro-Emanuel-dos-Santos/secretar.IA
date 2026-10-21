import { contactTimezone } from "./preferences";
import { Prisma } from "@prisma/client";
import { AIInterpretation } from "../types/ai.types";
import { parseTimestamp, validateReminder } from "./reminder.validation";
import { resolveSubject } from "./business.memory";
import { validateTaskSelection } from "./task.selection";

export const reminderScope = (phone: string, phoneNumberId: string,includeSystem=false): Prisma.ReminderWhereInput => ({
  ...(includeSystem?{}:{kind:"task"}),
  user: { phone }, OR: [{ sourceMessage: { phoneNumberId } }, { scheduleOutbox: { phoneNumberId } }],
});
const formatDate = (date: Date,timeZone:string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone, dateStyle: "short", timeStyle: "short",
}).format(date);
const displayTitle = (title: string) => title.length > 100 ? title.slice(0, 97) + "..." : title;

export async function manageReminders(phone: string, phoneNumberId: string, intent: AIInterpretation, tx: Prisma.TransactionClient,sourceMessageId?:string) {
  if (!["list_reminders", "cancel_reminder", "complete_reminder", "reschedule_reminder", "mark_waiting", "edit_reminder"].includes(intent.action)) return "Ainda não consigo executar essa operação.";
  if(!await validateTaskSelection(tx,phone,phoneNumberId,intent))return "Essa lista ou tarefa mudou desde a consulta. Peça uma nova lista antes de escolher pelo número.";
  const scope = reminderScope(phone, phoneNumberId);
  const timezone=await contactTimezone(tx,phone,phoneNumberId);
  const displayDate=(date:Date)=>formatDate(date,timezone);
  let range: Prisma.DateTimeFilter | undefined;
  if (intent.rangeStart || intent.rangeEnd) {
    try {
      const start = parseTimestamp(intent.rangeStart), end = parseTimestamp(intent.rangeEnd);
      if (start >= end) throw new Error("Intervalo invertido.");
      range = { gte: start, lt: end };
    } catch { return "Qual dia ou período você quer consultar?"; }
  }
  if (intent.action === "list_reminders") {
    let subjectId:string|undefined;
    if(intent.subject){
      const resolved=await resolveSubject(tx,phone,phoneNumberId,intent.subject,intent.subjectKind || "client");
      if(resolved.ambiguous)return "Qual é o nome completo do cliente ou projeto?";
      if(!resolved.subject)return "Não encontrei esse cliente ou projeto no cadastro.";
      subjectId=resolved.subject.id;
    }
    const filter=intent.taskFilter;
    const progress:Prisma.ReminderWhereInput=filter==="completed" || filter==="cancelled" ? {state:filter}
      : filter==="waiting" ? {state:"active",taskProgress:"waiting"}
      : filter==="overdue" ? {state:"active",taskProgress:"pending",AND:[{remindAt:{lt:new Date()}}]}
      : filter==="pending" ? {state:"active",taskProgress:"pending"} : {state:"active"};
    const dateScope:Prisma.ReminderWhereInput=range ? filter==="completed" || filter==="cancelled"
      ? {OR:[{progressUpdatedAt:range},{progressUpdatedAt:null,updatedAt:range}]} : {remindAt:range} : {};
    const reminders = await tx.reminder.findMany({
      where: { AND:[scope,progress,dateScope,...(subjectId?[{subjectId,appointmentId:null}]:[])] },
      include:{subject:{select:{name:true}}},
      orderBy: [{ remindAt: "asc" }, { id: "asc" }], take: 11,
    });
    const heading=filter==="waiting" ? "Tarefas aguardando resposta" : filter==="completed" ? "Tarefas concluídas" : filter==="cancelled" ? "Tarefas canceladas" : filter==="overdue" ? "Tarefas atrasadas" : "Seus lembretes pendentes";
    if (!reminders.length) return filter ? "Nenhuma tarefa encontrada com esse filtro nesse período." : "Você não tem lembretes pendentes nesse período.";
    if(sourceMessageId){
      const source=await tx.incomingMessage.findFirst({where:{id:sourceMessageId,phone,phoneNumberId},select:{id:true}});
      if(!source)throw Error("Origem da lista incompatível.");
      await tx.event.create({data:{userId:reminders[0].userId,type:"task_list_presented",source:"secretaria",payload:{phoneNumberId,sourceMessageId,items:reminders.slice(0,10).map(r=>({id:r.id,version:r.scheduleVersion,title:r.title,remindAt:r.remindAt.toISOString(),state:r.state,taskProgress:r.taskProgress}))}}});
    }
    return heading+":\n" + reminders.slice(0, 10).map((r, index) =>
      `${index + 1}. ${displayTitle(r.title)}${r.subject?" ("+r.subject.name+")":""} — ${displayDate(r.remindAt)}` +
      (r.taskProgress==="waiting" ? ` (aguardando${r.waitingFor?" "+r.waitingFor:" resposta"}${["awaiting_followup","provider_accepted"].includes(r.status)?"; sem novo aviso agendado":""})` : "")+
      (r.status === "blocked_paused" ? " (não enviado durante a pausa)" : r.status === "missed" ? " (vencido, não enviado)"
        : r.status === "provider_rejected" ? " (recusado pelo WhatsApp)" : "")).join("\n") +
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
  // A linked alert is managed through its event so offsets and event time
  // cannot diverge during concurrent rescheduling (including old buttons).
  if(target.appointmentId && intent.action==="reschedule_reminder")return "Esse aviso pertence a um compromisso. Diga quanto tempo antes quer ser avisado ou peça para reagendar o compromisso.";
  if(intent.action==="edit_reminder"){
    if(target.appointmentId)return "Esse aviso pertence a um compromisso. A correção do título está disponível para tarefas avulsas.";
    const newTitle=intent.newTitle?.trim();
    if(!newTitle)return "Qual deve ser o novo título da tarefa?";
    if(newTitle.length>500)return "Pode resumir o título em até 500 caracteres?";
    if(["sending","delivery_unknown"].includes(target.status))return "O envio desse aviso ainda não foi confirmado. Aguarde antes de corrigir o título.";
    if(newTitle===target.title)return "Essa tarefa já está com esse título.";
    const schedule=["pending","scheduled","scheduling_pending"].includes(target.status);
    const changed=await tx.reminder.updateMany({where:{...scope,id:target.id,state:"active",scheduleVersion:target.scheduleVersion,status:target.status},data:{title:newTitle,scheduleVersion:{increment:1},...(schedule?{status:"scheduling_pending"}:{})}});
    if(!changed.count)return "Essa tarefa mudou enquanto eu processava. Pode confirmar o que deseja?";
    if(schedule)await tx.scheduleOutbox.upsert({where:{reminderId:target.id},create:{reminderId:target.id,phoneNumberId},update:{status:"pending",attempts:0,nextAttemptAt:new Date(),leaseToken:null,leaseUntil:null,lastError:null}});
    await tx.event.create({data:{userId:target.userId,type:"reminder_title_changed",source:"secretaria",payload:{phoneNumberId,reminderId:target.id,previousTitle:target.title,title:newTitle,previousVersion:target.scheduleVersion}}});
    return `Corrigi a tarefa para: ${newTitle}. O horário continua ${displayDate(target.remindAt)}.`+
      (schedule ? " A atualização do aviso está sendo confirmada." : target.status==="provider_accepted" ? " O aviso anterior já foi aceito pelo provedor; não agendei outro envio." : " O estado do aviso foi mantido; não agendei outro envio.");
  }
  if(intent.action==="mark_waiting"){
    if(target.appointmentId)return "Esse aviso pertence a um compromisso. O acompanhamento de resposta é para tarefas avulsas.";
    let followup:Date|undefined;
    if(intent.datetime){
      try{followup=validateReminder({phone,title:target.title,remindAt:intent.datetime}).reminderDate;}catch{return "Para o acompanhamento, preciso de um dia e horário válidos no futuro.";}
      const preference=await tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone}}});
      if(preference?.remindersPaused)return "Seus avisos estão pausados. Envie RETOMAR antes de agendar o acompanhamento.";
    }
    const allowed=["pending","scheduled","scheduling_pending","scheduling_failed","blocked_template","blocked_paused","missed","provider_rejected","provider_accepted","awaiting_followup"];
    if(!allowed.includes(target.status))return "O envio desse aviso ainda está em andamento ou sem confirmação. Aguarde antes de alterar o acompanhamento.";
    const waitingFor=intent.waitingFor?.trim() || target.waitingFor || null;
    if(waitingFor && waitingFor.length>120)return "Pode resumir quem ou o que você está aguardando?";
    if(target.taskProgress==="waiting" && target.waitingFor===waitingFor){
      if(!followup && ["awaiting_followup","provider_accepted"].includes(target.status))return `Essa tarefa já está aguardando${waitingFor?" "+waitingFor:" resposta"}. Não há novo aviso agendado.`;
      if(followup?.getTime()===target.remindAt.getTime() && ["pending","scheduled","scheduling_pending"].includes(target.status))return `Essa tarefa já está aguardando${waitingFor?" "+waitingFor:" resposta"}, com aviso em ${displayDate(followup)}. Mantive o agendamento existente.`;
    }
    const changed=await tx.reminder.updateMany({where:{...scope,id:target.id,state:"active",scheduleVersion:target.scheduleVersion,status:{in:allowed}},data:{taskProgress:"waiting",waitingFor,progressUpdatedAt:new Date(),scheduleVersion:{increment:1},...(followup ? {remindAt:followup,status:"scheduling_pending",providerMessageId:null,deliveryStartedAt:null,deliveryStatus:null,deliveryUpdatedAt:null,deliveryErrorCodes:Prisma.DbNull} : target.status==="provider_accepted"?{}:{status:"awaiting_followup"})}});
    if(!changed.count)return "Essa tarefa mudou enquanto eu processava. Pode confirmar o que deseja?";
    if(followup)await tx.scheduleOutbox.upsert({where:{reminderId:target.id},create:{reminderId:target.id,phoneNumberId},update:{status:"pending",attempts:0,nextAttemptAt:new Date(),leaseToken:null,leaseUntil:null,lastError:null}});
    else await tx.scheduleOutbox.updateMany({where:{reminderId:target.id},data:{status:"cancelled",leaseToken:null,leaseUntil:null}});
    await tx.event.create({data:{userId:target.userId,type:"task_waiting",source:"secretaria",payload:{reminderId:target.id,phoneNumberId,previousProgress:target.taskProgress,previousWaitingFor:target.waitingFor,waitingFor,previousVersion:target.scheduleVersion,previousRemindAt:target.remindAt.toISOString(),followupAt:followup?.toISOString() || null}}});
    return `Anotei: ${target.title} — aguardando${waitingFor?" "+waitingFor:" resposta"}. `+(followup ? `Novo aviso em ${displayDate(followup)}; o agendamento está sendo confirmado.` : "Os avisos pendentes dessa tarefa foram suspensos. Não agendei um novo aviso.");
  }
  const cancellable = ["pending", "scheduled", "scheduling_pending", "scheduling_failed", "blocked_template", "blocked_paused", "missed", "provider_rejected", "awaiting_followup"];
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
      data: { remindAt: reminderDate, taskProgress: "pending", waitingFor:null, progressUpdatedAt:new Date(), scheduleVersion: { increment: 1 }, status: "scheduling_pending",
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
    data: { state, taskProgress:state, progressUpdatedAt:new Date() },
  });
  if (!changed.count) return "Esse lembrete mudou enquanto eu processava. Pode confirmar o que deseja?";
  await tx.scheduleOutbox.updateMany({
    where: { reminderId: target.id }, data: { status: "cancelled", leaseToken: null, leaseUntil: null },
  });
  if (state === "cancelled") return `Cancelei o lembrete: ${target.title}.`;
  return `Marquei como concluído: ${target.title}.` +
    (["sending", "delivery_unknown"].includes(target.status) ? " O envio do aviso já tinha começado." : "");
}
