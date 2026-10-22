import { contactTimezone } from "./preferences";
import type { Prisma } from "@prisma/client";
import { reminderScope } from "./reminder.management";
import { counted } from "./reply.language";

export function calendarDay(time:number,timeZone="America/Sao_Paulo") {
  const dayFormatter=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"});
  const p=Object.fromEntries(dayFormatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  return Date.UTC(+p.year,+p.month-1,+p.day);
}
export function dayBoundary(target:number,timeZone:string) {
  // Find the first instant belonging to the calendar day. This also handles
  // days that start at 01:00 or last 23/25 hours after an offset transition.
  let low=target-18*3600000,high=target+18*3600000;
  while(low<high){const middle=low+Math.floor((high-low)/2);if(calendarDay(middle,timeZone)<target)low=middle+1;else high=middle;}
  return new Date(low);
}
export function brasiliaDay(now:Date,timeZone="America/Sao_Paulo") {
  const day=calendarDay(now.getTime(),timeZone);
  return {start:dayBoundary(day,timeZone),end:dayBoundary(day+24*3600000,timeZone)};
}
export async function dayOverview(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,now=new Date()) {
  const timezone=await contactTimezone(tx,phone,phoneNumberId);
  const {start,end}=brasiliaDay(now,timezone),base={...reminderScope(phone,phoneNumberId),state:"active",appointmentId:null},scope={...base,taskProgress:"pending"};
  const eventScope={user:{phone},phoneNumberId,state:"active",startsAt:{gte:start,lt:end}};
  const [overdue,today,rows,preference,appointments,eventCount,waiting]=await Promise.all([
    tx.reminder.count({where:{...scope,remindAt:{lt:start}}}),
    tx.reminder.count({where:{...scope,remindAt:{gte:start,lt:end}}}),
    tx.reminder.findMany({where:{...scope,remindAt:{gte:start,lt:end}},orderBy:[{remindAt:"asc"},{id:"asc"}],take:5}),
    tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone}}}),
    tx.appointment.findMany({where:eventScope,orderBy:[{startsAt:"asc"},{id:"asc"}],take:5}),
    tx.appointment.count({where:eventScope}),
    tx.reminder.count({where:{...base,taskProgress:"waiting"}}),
  ]);
  const time=(value:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,hour:"2-digit",minute:"2-digit"}).format(value);
  const date=new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short"}).format(now);
  const items=rows.map(r=>`• ${time(r.remindAt)} — ${r.title.slice(0,120)}`+
    (r.status === "missed" || r.status === "blocked_paused" ? " (não enviado)" : r.status === "provider_rejected" ? " (recusado pelo WhatsApp)" : "")).join("\n");
  return `Seu dia, ${date}, ${timezone==="America/Sao_Paulo"?"no horário de Brasília":"no fuso "+timezone}:\n`+
    (today ? `${counted(today,"tarefa pendente","tarefas pendentes")} para hoje.\n${items}` : "Nenhuma tarefa pendente para hoje.")+
    (today>5 ? "\nMostrei as cinco primeiras; peça um período para consultar as demais." : "")+
    (eventCount ? `\n${counted(eventCount,"compromisso","compromissos")} hoje:\n`+appointments.map(a=>`• ${time(a.startsAt)} — ${a.title.slice(0,120)}`).join("\n")+(eventCount>5?"\nMostrei os cinco primeiros; peça para consultar a agenda completa.":"") : "")+
    (overdue ? `\nVocê também tem ${counted(overdue,"pendência","pendências")} de dias anteriores. Peça para listar as pendências anteriores.` : "")+
    (waiting ? `\n${counted(waiting,"tarefa aguardando","tarefas aguardando")} resposta. Pergunte o que está aguardando para consultar.` : "")+
    (preference?.remindersPaused ? "\nSeus avisos estão pausados. Envie RETOMAR para voltar." : "");
}
