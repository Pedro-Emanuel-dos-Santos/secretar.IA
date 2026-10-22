import type { Prisma } from "@prisma/client";
import { calendarDay,dayBoundary } from "./day.overview";
import { contactTimezone } from "./preferences";
import { reminderScope } from "./reminder.management";
import { resolveSubject } from "./business.memory";
import { parseTimestamp } from "./reminder.validation";
import { counted,titledSubject } from "./reply.language";
export type AgendaPeriod="today"|"tomorrow"|"day_after_tomorrow"|"week"|"next_week"|"next_7_days";
export function agendaRange(period:AgendaPeriod,now:Date,zone:string){
 const day=calendarDay(now.getTime(),zone),weekday=(new Date(day).getUTCDay()+6)%7;
 const offset=period==="tomorrow"?1:period==="day_after_tomorrow"?2:period==="week"?-weekday:period==="next_week"?7-weekday:0;
 const days=["week","next_week","next_7_days"].includes(period)?7:1;
 return {start:dayBoundary(day+offset*86400000,zone),end:dayBoundary(day+(offset+days)*86400000,zone)};
}
export async function agendaOverview(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,period:AgendaPeriod="week",now=new Date(),filter?:{subject?:string;subjectKind?:"client"|"project";rangeStart?:string|null;rangeEnd?:string|null}){
 if(!["today","tomorrow","day_after_tomorrow","week","next_week","next_7_days"].includes(period) || !Number.isFinite(now.getTime()))return "Você quer consultar hoje, amanhã, depois de amanhã, esta semana, a próxima semana ou os próximos sete dias?";
 const zone=await contactTimezone(tx,phone,phoneNumberId);
 let {start,end}=agendaRange(period,now,zone);
 const custom=!!(filter?.rangeStart || filter?.rangeEnd);
 if(custom){try{start=parseTimestamp(filter?.rangeStart);end=parseTimestamp(filter?.rangeEnd);if(start>=end || calendarDay(end.getTime()-1,zone)-calendarDay(start.getTime(),zone)>30*86400000)throw Error();}catch{return "Preciso de um início e fim válidos, com início antes do fim e até 31 dias de calendário. Qual período você quer consultar?";}}
 let subject:{id:string;name:string}|null=null;
 if(filter?.subject){const result=await resolveSubject(tx,phone,phoneNumberId,filter.subject,filter.subjectKind || "client");if(result.ambiguous)return "Qual é o nome completo do cliente ou projeto? Encontrei nomes parecidos.";if(!result.subject)return "Não encontrei esse cliente ou projeto no cadastro.";subject=result.subject;}
 const subjectScope=subject?{subjectId:subject.id}:{};
 const base={...reminderScope(phone,phoneNumberId),...subjectScope,appointmentId:null,state:"active"};
 const tasks={...base,taskProgress:"pending",remindAt:{gte:start,lt:end}},waiting={...base,taskProgress:"waiting"};
 const appointments={user:{phone},phoneNumberId,...subjectScope,state:"active",startsAt:{gte:start,lt:end}};
 const [taskRows,taskCount,eventRows,eventCount,waitingRows,waitingCount,earlier,preference]=await Promise.all([
  tx.reminder.findMany({where:tasks,include:{subject:{select:{name:true}}},orderBy:[{remindAt:"asc"},{id:"asc"}],take:6}),tx.reminder.count({where:tasks}),
  tx.appointment.findMany({where:appointments,include:{subject:{select:{name:true}}},orderBy:[{startsAt:"asc"},{id:"asc"}],take:6}),tx.appointment.count({where:appointments}),
  tx.reminder.findMany({where:waiting,include:{subject:{select:{name:true}}},orderBy:[{remindAt:"asc"},{id:"asc"}],take:3}),tx.reminder.count({where:waiting}),
  tx.reminder.count({where:{...base,taskProgress:"pending",remindAt:{lt:start}}}),tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone}}}),
 ]);
 const date=(d:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:zone,day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
 const singleDay=calendarDay(start.getTime(),zone)===calendarDay(end.getTime()-1,zone);
 const time=(d:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:zone,...(singleDay?{}:{day:"2-digit" as const,month:"2-digit" as const}),hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d);
 const title=(item:{title:string;subject?:{name:string}|null},limit=100)=>titledSubject(item.title.slice(0,limit),item.subject?{name:item.subject.name.slice(0,60)}:null);
 const names={today:"Hoje",tomorrow:"Amanhã",day_after_tomorrow:"Depois de amanhã",week:"Sua semana (segunda a domingo)",next_week:"Próxima semana (segunda a domingo)",next_7_days:"Próximos sete dias (inclui hoje)"};
 const rows=[...taskRows.map(t=>({id:t.id,at:t.remindAt,kind:"task",line:`• ${time(t.remindAt)} — Aviso de tarefa: ${title(t)}${["missed","blocked_paused","provider_rejected"].includes(t.status)?" [não enviado]":""}`})),
  ...eventRows.map(a=>({id:a.id,at:a.startsAt,kind:"event",line:`• ${time(a.startsAt)} — Compromisso: ${title(a)}`}))].sort((a,b)=>a.at.getTime()-b.at.getTime() || a.id.localeCompare(b.id)).slice(0,8);
 const full=(d:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:zone,dateStyle:"short",timeStyle:"short"}).format(d);
 const label=custom?`Agenda do período: ${full(start)} até ${full(end)} (fim exclusivo)`:singleDay?`${names[period]}, ${date(start)}`:`${names[period]}: ${date(start)} a ${date(new Date(end.getTime()-1))}`;
 const counts=[eventCount?counted(eventCount,"compromisso registrado","compromissos registrados"):"",taskCount?counted(taskCount,"tarefa pendente","tarefas pendentes"):""].filter(Boolean);
 const summary=counts.length?`${counts.join(" e ")}${taskCount?" com aviso":""} nesse período.`:"Não há compromissos registrados nem avisos de tarefas pendentes nesse período.";
 const lines=[`${subject?`Agenda de ${subject.name}. `:""}${label}. Fuso: ${zone}.`,summary,...rows.map(r=>r.line)];
 if(rows.filter(r=>r.kind==="task").length<taskCount || rows.filter(r=>r.kind==="event").length<eventCount)lines.push("Há mais itens no período. Consulte um dia ou liste tarefas/compromissos para ver os demais.");
 if(waitingCount){lines.push(`${counted(waitingCount,"tarefa aguardando","tarefas aguardando")} resposta, incluindo avisos fora do período:`);for(const task of waitingRows)lines.push(`• ${title(task,90)}${task.waitingFor?` — aguardando ${task.waitingFor.slice(0,100)}`:""}`);if(waitingCount>waitingRows.length)lines.push("Há mais retornos aguardando. Peça para listar as tarefas em espera.");}
 if(earlier)lines.push(`${counted(earlier,"tarefa pendente","tarefas pendentes")} com aviso anterior a este período.`);
 if(preference?.remindersPaused)lines.push("Seus avisos estão pausados. Envie RETOMAR para voltar.");
 return lines.join("\n");
}
