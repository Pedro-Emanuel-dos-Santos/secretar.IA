import { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { persistReminderInTransaction } from "./reminder.creator";
import { parseTimestamp, validateReminder } from "./reminder.validation";
import { reminderLimits } from "./reminder.limits";
import { reminderScope } from "./reminder.management";
import { resolveSubject } from "./business.memory";

const display=(date:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(date);
const editable=["pending","scheduled","scheduling_pending","scheduling_failed","blocked_template","blocked_paused","missed","provider_rejected"];
export async function executeAppointment(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,sourceMessageId:string) {
  const scope={user:{phone},phoneNumberId};
  if(intent.action==="list_appointments") {
    let range:Prisma.DateTimeFilter|undefined;
    if(intent.rangeStart || intent.rangeEnd){try{const start=parseTimestamp(intent.rangeStart),end=parseTimestamp(intent.rangeEnd);if(start>=end)throw Error();range={gte:start,lt:end};}catch{return "Qual dia ou período você quer consultar?";}}
    const rows=await tx.appointment.findMany({where:{...scope,state:"active",startsAt:range},include:{reminders:{where:{state:"active"},select:{remindAt:true}}},orderBy:[{startsAt:"asc"},{id:"asc"}],take:11});
    return rows.length ? "Seus compromissos:\n"+rows.slice(0,10).map(a=>`• ${a.title.slice(0,160)} — ${display(a.startsAt)}; avisos: ${a.reminders.map(r=>display(r.remindAt)).join(", ")||"nenhum"}`).join("\n")+(rows.length>10?"\nMostrei os dez primeiros. Consulte um período menor.":"") : "Você não tem compromissos nesse período.";
  }
  const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
  let appointment;
  if(intent.action!=="create_appointment") {
    const search=intent.search?.trim();
    if(!intent.appointmentId && !search)return "Qual compromisso você quer alterar?";
    const matches=await tx.appointment.findMany({where:{...scope,state:"active",...(intent.appointmentId?{id:intent.appointmentId}:{title:{contains:search,mode:"insensitive" as const}})},take:2});
    if(matches.length>1)return "Qual deles?\n"+matches.map(a=>`• ${a.title.slice(0,100)} — ${display(a.startsAt)}`).join("\n");
    appointment=matches[0];
    if(!appointment)return "Não encontrei esse compromisso entre os seus ativos.";
    await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id=${appointment.id} FOR UPDATE`;
    appointment=await tx.appointment.findFirstOrThrow({where:{...scope,id:appointment.id,state:"active"}});
    await tx.$queryRaw`SELECT id FROM "Reminder" WHERE "appointmentId"=${appointment.id} ORDER BY id FOR UPDATE`;
  } else {
    const replay=await tx.appointment.findFirst({where:{...scope,sourceMessageId}});
    if(replay)return `Esse compromisso já está registrado: ${replay.title}, em ${display(replay.startsAt)}.`;
    if(!intent.title?.trim())return "Qual é o compromisso?";
  }
  const oldAlerts=appointment ? await tx.reminder.findMany({where:{appointmentId:appointment.id,state:"active"}}) : [];
  if(oldAlerts.some(r=>["sending","delivery_unknown"].includes(r.status)))return "Um aviso desse compromisso já entrou em envio e ainda não tem resultado confirmado. Aguarde antes de alterar o compromisso.";
  if(intent.action==="cancel_appointment") {
    await tx.appointment.update({where:{id:appointment!.id},data:{state:"cancelled",version:{increment:1}}});
    await tx.reminder.updateMany({where:{appointmentId:appointment!.id,state:"active",status:{in:editable}},data:{state:"cancelled",scheduleVersion:{increment:1}}});
    await tx.scheduleOutbox.updateMany({where:{reminder:{appointmentId:appointment!.id,state:"cancelled"}},data:{status:"cancelled",leaseToken:null,leaseUntil:null}});
    await tx.event.create({data:{userId:user.id,type:"appointment_cancelled",source:"secretaria",payload:{appointmentId:appointment!.id,phoneNumberId,sourceMessageId,previousVersion:appointment!.version,previousStartsAt:appointment!.startsAt.toISOString(),previousAlertMinutes:oldAlerts.map(r=>r.appointmentOffsetMinutes ?? 0)}}});
    return `Cancelei o compromisso: ${appointment!.title}. Avisos já enviados não são desfeitos.`;
  }
  const paused=await tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone}}});
  if(paused?.remindersPaused)return "Seus avisos estão pausados. Envie RETOMAR antes de criar ou alterar compromissos com avisos.";
  if(intent.recurrence)return "Por enquanto, os compromissos são avulsos. Para repetição, posso criar uma série de lembretes.";
  let startsAt:Date;
  if(intent.action==="set_appointment_alerts")startsAt=appointment!.startsAt;
  else {
    if(!intent.datetime)return intent.draft?.date ? "Que horas será o compromisso?" : "Em qual dia e horário será o compromisso?";
    try{startsAt=validateReminder({phone,title:intent.title || appointment!.title,remindAt:intent.datetime}).reminderDate;}catch{return "Preciso de um dia e horário válidos no futuro para o compromisso.";}
  }
  if(intent.action==="set_appointment_alerts" && !intent.alertMinutes)return "Quanto tempo antes do compromisso você quer ser avisado?";
  const offsets=intent.alertMinutes || (appointment ? oldAlerts.map(r=>r.appointmentOffsetMinutes ?? 0) : [0]);
  if(!offsets.length || offsets.length>3)return "Quais avisos você quer? Posso preparar até três por compromisso.";
  if(offsets.some(n=>!Number.isFinite(n)||n<0||n>10080)||new Set(offsets).size!==offsets.length)return "Escolha até três horários diferentes de aviso, no máximo sete dias antes.";
  const dates=offsets.map(n=>new Date(startsAt.getTime()-n*60000));
  if(dates.some(d=>d.getTime()<=Date.now()))return "Um desses avisos já ficaria no passado. Quanto tempo antes você quer ser avisado?";
  const previous=appointment ? {version:appointment.version,startsAt:appointment.startsAt.toISOString(),alertMinutes:oldAlerts.map(r=>r.appointmentOffsetMinutes ?? 0)} : null;
  if(previous && oldAlerts.every(r=>["pending","scheduled","scheduling_pending"].includes(r.status)) && previous.startsAt===startsAt.toISOString() && JSON.stringify([...previous.alertMinutes].sort((a,b)=>a-b))===JSON.stringify([...offsets].sort((a,b)=>a-b))){
    return `Esse compromisso já está em ${display(startsAt)}. Avisos: ${dates.map(display).join(", ")}. Mantive o agendamento existente.`;
  }
  // Preflight the entire replacement while holding the contact lock. No old
  // alert is cancelled until every new alert passes limits and validation.
  const limits=reminderLimits(), rscope=reminderScope(phone,phoneNumberId);
  const active=await tx.reminder.count({where:{...rscope,state:"active"}}),recent=await tx.reminder.count({where:{...rscope,createdAt:{gte:new Date(Date.now()-86400000)}}});
  if(active-oldAlerts.length+offsets.length>limits.active || recent+offsets.length>limits.perDay)return "O limite de avisos foi atingido. Conclua alguns lembretes ou tente novamente mais tarde.";
  let subjectId:string|undefined;
  if(intent.subject){const resolved=await resolveSubject(tx,phone,phoneNumberId,intent.subject,intent.subjectKind);if(!resolved.subject)return "Preciso do nome exato de um cliente ou projeto já registrado para vincular o compromisso.";subjectId=resolved.subject.id;}
  if(!appointment){
    const incoming=await tx.incomingMessage.findFirst({where:{id:sourceMessageId,phone,phoneNumberId}});
    if(!incoming)throw Error("Origem incompatível.");
    appointment=await tx.appointment.create({data:{userId:user.id,phoneNumberId,sourceMessageId,title:intent.title!.trim(),description:intent.description,startsAt,subjectId}});
  } else {
    await tx.reminder.updateMany({where:{appointmentId:appointment.id,state:"active"},data:{state:"cancelled",scheduleVersion:{increment:1}}});
    await tx.scheduleOutbox.updateMany({where:{reminder:{appointmentId:appointment.id,state:"cancelled"}},data:{status:"cancelled",leaseToken:null,leaseUntil:null}});
    appointment=await tx.appointment.update({where:{id:appointment.id},data:{startsAt,version:{increment:1}}});
  }
  for(let i=0;i<dates.length;i++)await persistReminderInTransaction({phone,title:appointment.title,description:`Compromisso em ${display(startsAt)}.`,remindAt:dates[i].toISOString()},tx,{phoneNumberId,appointmentId:appointment.id,appointmentOffsetMinutes:offsets[i]});
  await tx.event.create({data:{userId:user.id,type:previous ? "appointment_changed" : "appointment_created",source:"secretaria",payload:{appointmentId:appointment.id,phoneNumberId,sourceMessageId,action:intent.action,previous,version:appointment.version,startsAt:startsAt.toISOString(),alertMinutes:offsets}}});
  return `Compromisso: ${appointment.title}, em ${display(startsAt)}. Avisos: ${dates.map(display).join(", ")}. O agendamento dos avisos está sendo confirmado.`;
}
