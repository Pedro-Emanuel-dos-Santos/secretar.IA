import type { Prisma } from "@prisma/client";
import { reminderScope } from "./reminder.management";

const dayFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"});
function calendarDay(time:number) {
  const p=Object.fromEntries(dayFormatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  return Date.UTC(+p.year,+p.month-1,+p.day);
}
function dayBoundary(target:number) {
  // Find the first instant belonging to the calendar day. This also handles
  // days that start at 01:00 or last 23/25 hours after an offset transition.
  let low=target-18*3600000,high=target+18*3600000;
  while(low<high){const middle=low+Math.floor((high-low)/2);if(calendarDay(middle)<target)low=middle+1;else high=middle;}
  return new Date(low);
}
export function brasiliaDay(now:Date) {
  const day=calendarDay(now.getTime());
  return {start:dayBoundary(day),end:dayBoundary(day+24*3600000)};
}
export async function dayOverview(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,now=new Date()) {
  const {start,end}=brasiliaDay(now),base={...reminderScope(phone,phoneNumberId),state:"active",appointmentId:null},scope={...base,taskProgress:"pending"};
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
  const time=(value:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(value);
  const date=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short"}).format(now);
  const items=rows.map(r=>`• ${time(r.remindAt)} — ${r.title.slice(0,120)}`+
    (r.status === "missed" || r.status === "blocked_paused" ? " (não enviado)" : r.status === "provider_rejected" ? " (recusado pelo WhatsApp)" : "")).join("\n");
  return `Seu dia, ${date}, no horário de Brasília:\n`+
    (today ? `${today} tarefa(s) pendente(s) para hoje.\n${items}` : "Nenhuma tarefa pendente para hoje.")+
    (today>5 ? "\nMostrei as cinco primeiras; peça um período para consultar as demais." : "")+
    (eventCount ? `\n${eventCount} compromisso(s) hoje:\n`+appointments.map(a=>`• ${time(a.startsAt)} — ${a.title.slice(0,120)}`).join("\n")+(eventCount>5?"\nMostrei os cinco primeiros; peça para consultar a agenda completa.":"") : "")+
    (overdue ? `\nVocê também tem ${overdue} pendência(s) de dias anteriores. Peça para listar as pendências anteriores.` : "")+
    (waiting ? `\n${waiting} tarefa(s) aguardando resposta. Pergunte o que está aguardando para consultar.` : "")+
    (preference?.remindersPaused ? "\nSeus avisos estão pausados. Envie RETOMAR para voltar." : "");
}
