import { contactTimezone } from "./preferences";
import { spokenMoment,appointmentQuestion,alertOffset,counted } from "./reply.language";
import { Prisma } from "@prisma/client";
import type { Appointment } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { persistReminderInTransaction } from "./reminder.creator";
import { parseTimestamp, validateReminder } from "./reminder.validation";
import { reminderLimits } from "./reminder.limits";
import { reminderScope } from "./reminder.management";
import { resolveSubject, normalizeName } from "./business.memory";

const formatDate=(date:Date,timeZone:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone,dateStyle:"short",timeStyle:"short"}).format(date);
const editable=["pending","scheduled","scheduling_pending","scheduling_failed","blocked_template","blocked_paused","missed","provider_rejected"];
async function normalizedMatches(tx:Prisma.TransactionClient,scope:Prisma.AppointmentWhereInput,search:string){
  const words=normalizeName(search).split(/[^a-z0-9]+/).filter(w=>w && !["a","o","as","os","de","da","do","das","dos","com","para","um","uma"].includes(w));
  if(!words.length)return [];
  const candidates=await tx.appointment.findMany({where:scope,orderBy:[{startsAt:"asc"},{id:"asc"}],take:101});
  if(candidates.length>100)return null; // Never silently choose from a truncated set.
  return candidates.filter(a=>{const titleWords=normalizeName(a.title).split(/[^a-z0-9]+/);return words.every(w=>titleWords.includes(w));});
}
export async function executeAppointment(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,sourceMessageId:string) {
  const timezone=await contactTimezone(tx,phone,phoneNumberId);
  const display=(date:Date)=>formatDate(date,timezone);
  const scope={user:{phone},phoneNumberId};
  if(intent.action==="appointment_history")return appointmentHistory(phone,phoneNumberId,intent,tx,timezone);
  if(intent.action==="list_appointments") {
    let range:Prisma.DateTimeFilter|undefined;
    if(intent.rangeStart || intent.rangeEnd){try{const start=parseTimestamp(intent.rangeStart),end=parseTimestamp(intent.rangeEnd);if(start>=end)throw Error();range={gte:start,lt:end};}catch{return "Qual dia ou período você quer consultar?";}}
    const rows=await tx.appointment.findMany({where:{...scope,state:"active",startsAt:range},include:{reminders:{where:{state:"active"},select:{remindAt:true}}},orderBy:[{startsAt:"asc"},{id:"asc"}],take:11});
    return rows.length ? "Seus compromissos:\n"+rows.slice(0,10).map(a=>`• ${a.title.slice(0,160)} — ${display(a.startsAt)}${a.endsAt?" até "+display(a.endsAt):""}; avisos: ${a.reminders.map(r=>display(r.remindAt)).join(", ")||"nenhum"}`).join("\n")+(rows.length>10?"\nMostrei os dez primeiros. Consulte um período menor.":"") : "Você não tem compromissos nesse período.";
  }
  const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
  let appointment:Appointment|undefined;
  if(intent.action!=="create_appointment") {
    const search=intent.search?.trim();
    if(!intent.appointmentId && !search)return "Qual compromisso você quer alterar?";
    let matches=await tx.appointment.findMany({where:{...scope,state:"active",...(intent.appointmentId?{id:intent.appointmentId}:{title:{contains:search,mode:"insensitive" as const}})},take:2});
    if(!matches.length && !intent.appointmentId && search){
      const fallback=await normalizedMatches(tx,{...scope,state:"active"},search);
      if(fallback===null)return "Há muitos compromissos para localizar por esse trecho. Informe o título completo ou o dia.";
      matches=fallback.slice(0,2);
    }
    if(matches.length>1)return "Qual deles?\n"+matches.map(a=>`• ${a.title.slice(0,100)} — ${display(a.startsAt)}`).join("\n");
    appointment=matches[0];
    if(!appointment)return "Não encontrei esse compromisso entre os seus ativos.";
    await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id=${appointment.id} FOR UPDATE`;
    appointment=await tx.appointment.findFirstOrThrow({where:{...scope,id:appointment.id,state:"active"}});
    if(intent.expectedVersion!==undefined && appointment.version!==intent.expectedVersion)return "Esse compromisso mudou desde a consulta. Confira o horário atual antes de reagendar.";
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
    if(!intent.datetime)return appointmentQuestion(intent.draft);
    try{startsAt=validateReminder({phone,title:intent.title || appointment!.title,remindAt:intent.datetime}).reminderDate;}catch{return "Preciso de um dia e horário válidos no futuro para o compromisso.";}
  }
  if(intent.action==="set_appointment_alerts" && !intent.alertMinutes)return "Quanto tempo antes do compromisso você quer ser avisado?";
  const duration=intent.action==="set_appointment_alerts"?undefined:intent.durationMinutes;
  if(duration!==undefined && (!Number.isSafeInteger(duration) || duration<1 || duration>1440))return "Qual é a duração do compromisso, entre 1 minuto e 24 horas?";
  const oldDuration=appointment?.endsAt?appointment.endsAt.getTime()-appointment.startsAt.getTime():null;
  const endsAt=duration!==undefined?new Date(startsAt.getTime()+duration*60000):oldDuration!==null?new Date(startsAt.getTime()+oldDuration):null;
  if(endsAt && endsAt<=startsAt)return "A duração desse compromisso não está válida. Qual é a duração correta?";
  if(intent.action!=="set_appointment_alerts"){
    const conflicts=await tx.appointment.findMany({where:{...scope,state:"active",...(appointment?{id:{not:appointment.id}}:{}),startsAt:{lt:endsAt || new Date(startsAt.getTime()+1)},...(endsAt?{OR:[{endsAt:{gt:startsAt}},{endsAt:null,startsAt:{gte:startsAt}}]}:{endsAt:{gt:startsAt}})},select:{title:true,startsAt:true,endsAt:true},orderBy:{startsAt:"asc"},take:3});
    if(conflicts.length)return "Esse horário se sobrepõe a compromissos na sua agenda cadastrada:\n"+conflicts.map(c=>`• ${c.title.slice(0,100)} — ${display(c.startsAt)}${c.endsAt?" até "+display(c.endsAt):" (fim não informado)"}`).join("\n")+"\nNão alterei o agendamento. Qual outro horário você prefere?";
  }
  const offsets=intent.alertMinutes || (appointment ? oldAlerts.map(r=>r.appointmentOffsetMinutes ?? 0) : [0]);
  if(!offsets.length || offsets.length>3)return "Quais avisos você quer? Posso preparar até três por compromisso.";
  if(offsets.some(n=>!Number.isFinite(n)||n<0||n>10080)||new Set(offsets).size!==offsets.length)return "Escolha até três horários diferentes de aviso, no máximo sete dias antes.";
  const dates=offsets.map(n=>new Date(startsAt.getTime()-n*60000));
  const now=Date.now();
  const preserved=oldAlerts.filter(r=>r.status==="provider_accepted" && r.remindAt.getTime()<=now && appointment?.startsAt.getTime()===startsAt.getTime() && offsets.includes(r.appointmentOffsetMinutes ?? 0));
  if(dates.some((d,i)=>d.getTime()<=now && !preserved.some(r=>r.appointmentOffsetMinutes===offsets[i])))return "Um desses avisos já ficaria no passado. Quanto tempo antes você quer ser avisado?";
  const future=dates.map((date,index)=>({date,offset:offsets[index]})).filter(r=>r.date.getTime()>now);
  const previous=appointment ? {version:appointment.version,startsAt:appointment.startsAt.toISOString(),endsAt:appointment.endsAt?.toISOString() || null,alertMinutes:oldAlerts.map(r=>r.appointmentOffsetMinutes ?? 0)} : null;
  if(previous && previous.endsAt===(endsAt?.toISOString() || null) && oldAlerts.every(r=>["pending","scheduled","scheduling_pending"].includes(r.status)) && previous.startsAt===startsAt.toISOString() && JSON.stringify([...previous.alertMinutes].sort((a,b)=>a-b))===JSON.stringify([...offsets].sort((a,b)=>a-b))){
    return `Esse compromisso já está em ${display(startsAt)}. Avisos: ${dates.map(display).join(", ")}. Mantive o agendamento existente.`;
  }
  // Preflight the entire replacement while holding the contact lock. No old
  // alert is cancelled until every new alert passes limits and validation.
  const limits=reminderLimits(), rscope=reminderScope(phone,phoneNumberId);
  const active=await tx.reminder.count({where:{...rscope,state:"active"}}),recent=await tx.reminder.count({where:{...rscope,createdAt:{gte:new Date(Date.now()-86400000)}}});
  if(active-oldAlerts.length+offsets.length>limits.active || recent+future.length>limits.perDay)return "O limite de avisos foi atingido. Conclua alguns lembretes ou tente novamente mais tarde.";
  let subjectId:string|undefined;
  if(intent.subject){const resolved=await resolveSubject(tx,phone,phoneNumberId,intent.subject,intent.subjectKind);if(!resolved.subject)return "Preciso do nome exato de um cliente ou projeto já registrado para vincular o compromisso.";subjectId=resolved.subject.id;}
  if(!appointment){
    const incoming=await tx.incomingMessage.findFirst({where:{id:sourceMessageId,phone,phoneNumberId}});
    if(!incoming)throw Error("Origem incompatível.");
    appointment=await tx.appointment.create({data:{userId:user.id,phoneNumberId,sourceMessageId,title:intent.title!.trim(),description:intent.description,startsAt,endsAt,subjectId}});
  } else {
    await tx.reminder.updateMany({where:{appointmentId:appointment.id,state:"active",id:{notIn:preserved.map(r=>r.id)}},data:{state:"cancelled",scheduleVersion:{increment:1}}});
    await tx.scheduleOutbox.updateMany({where:{reminder:{appointmentId:appointment.id,state:"cancelled"}},data:{status:"cancelled",leaseToken:null,leaseUntil:null}});
    appointment=await tx.appointment.update({where:{id:appointment.id},data:{startsAt,endsAt,version:{increment:1}}});
  }
  for(const alert of future)await persistReminderInTransaction({phone,title:appointment.title,description:`Compromisso em ${display(startsAt)}.`,remindAt:alert.date.toISOString()},tx,{phoneNumberId,appointmentId:appointment.id,appointmentOffsetMinutes:alert.offset});
  await tx.event.create({data:{userId:user.id,type:previous ? "appointment_changed" : "appointment_created",source:"secretaria",payload:{appointmentId:appointment.id,phoneNumberId,sourceMessageId,action:intent.action,previous,version:appointment.version,startsAt:startsAt.toISOString(),endsAt:endsAt?.toISOString() || null,alertMinutes:offsets}}});
  return `Anotei ${appointment.title} para ${spokenMoment(startsAt,timezone)}${endsAt?", até "+display(endsAt):""}. Avisos: ${future.map(r=>alertOffset(r.offset)).join(", ") || "nenhum novo"}.`+
    (preserved.length ? ` Mantive ${counted(preserved.length,"aviso já aceito","avisos já aceitos")} pelo WhatsApp, sem reenviar.` : "")+
    (future.length ? " O agendamento dos avisos está sendo confirmado." : "");
}

async function appointmentHistory(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,timezone:string){
  const display=(date:Date)=>formatDate(date,timezone);
  const search=intent.search?.trim();
  if(!intent.appointmentId && !search)return "De qual compromisso você quer ver o histórico?";
  let matches=await tx.appointment.findMany({where:{user:{phone},phoneNumberId,...(intent.appointmentId?{id:intent.appointmentId}:{title:{contains:search,mode:"insensitive" as const}})},take:2});
  if(!matches.length && !intent.appointmentId && search){
    const fallback=await normalizedMatches(tx,{user:{phone},phoneNumberId},search);
    if(fallback===null)return "Há muitos compromissos para localizar por esse trecho. Informe o título completo ou o dia.";
    matches=fallback.slice(0,2);
  }
  if(!matches.length)return "Não encontrei esse compromisso nos seus registros.";
  if(matches.length>1)return "Qual deles?\n"+matches.map(a=>`• ${a.title.slice(0,100)} — ${display(a.startsAt)}`).join("\n");
  const target=matches[0];
  const events=await tx.event.findMany({where:{userId:target.userId,type:{in:["appointment_created","appointment_changed","appointment_cancelled"]},AND:[{payload:{path:["phoneNumberId"],equals:phoneNumberId}},{payload:{path:["appointmentId"],equals:target.id}}]},orderBy:[{createdAt:"desc"},{id:"desc"}],take:11});
  if(!events.length)return "Ainda não há histórico de alterações registrado para esse compromisso.";
  const offsets=(value:unknown)=>Array.isArray(value) ? value.filter(n=>typeof n==="number"&&Number.isFinite(n)).map(n=>n===0?"na hora":`${n} min antes`).join(", ")||"nenhum" : "não registrado";
  const date=(value:unknown)=>typeof value==="string"&&Number.isFinite(new Date(value).getTime())?display(new Date(value)):"não registrado";
  let reply=`Histórico de ${target.title.slice(0,160)} (mais recente primeiro):\n`,shown=0;
  for(const event of events.slice(0,10)){
    const payload=event.payload as Record<string,unknown>;
    const previous=payload.previous && typeof payload.previous==="object" && !Array.isArray(payload.previous)?payload.previous as Record<string,unknown>:null;
    const detail=event.type==="appointment_cancelled" ? "Compromisso cancelado."
      : event.type==="appointment_created" ? `Criado para ${date(payload.startsAt)}${payload.endsAt?" até "+date(payload.endsAt):""}. Avisos: ${offsets(payload.alertMinutes)}.`
      : `Horário: ${date(previous?.startsAt)} → ${date(payload.startsAt)}.${payload.endsAt || previous?.endsAt?` Término: ${date(previous?.endsAt)} → ${date(payload.endsAt)}.`:""} Avisos: ${offsets(previous?.alertMinutes)} → ${offsets(payload.alertMinutes)}.`;
    const line=`• ${display(event.createdAt)} — ${detail}\n`;
    if(reply.length+line.length>3500)break;reply+=line;shown++;
  }
  return reply.trim()+(shown<events.length?"\nHá mais alterações anteriores; mostrei as mais recentes.":"");
}
