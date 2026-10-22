import type { AIInterpretation } from "../types/ai.types";
import { explicitClock } from "./conversation.timing";
import { localCalendarParts,localCalendarInstant } from "./recurrence";
import { parseTimestamp } from "./reminder.validation";
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const weekdays=["domingo","segunda","terca","quarta","quinta","sexta","sabado"];
function statedDay(text:string){return /\b(?:hoje|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\b|\bdia\s+(?:\d{1,2}|primeiro|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta)\b|\b\d{1,2}\s+de\s+\w+\b/.test(text);}
function simpleDay(text:string,now:Date,zone:string):number[]|null{
 if(/\b(?:semana|semanas|mes|meses|ano|anos)\b/.test(text))return null;
 const dayWords=text.replace(/\bdepois de amanha\b/g,'depois_amanha').match(/\b(?:hoje|amanha|depois_amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/g) || [];
 if(new Set(dayWords).size>1)return null;
 const current=localCalendarParts(now,zone),calendar=new Date(Date.UTC(current[0],current[1]-1,current[2]));
 let days:number;
 if(/\bdepois de amanha\b/.test(text))days=2;
 else if(/\bamanha\b/.test(text))days=1;
 else if(/\bhoje\b/.test(text))days=0;
 else {const mentions=weekdays.flatMap((day,index)=>new RegExp(`\\b${day}\\b`).test(text)?[index]:[]);if(mentions.length!==1)return null;days=(mentions[0]-calendar.getUTCDay()+7)%7 || 7;}
 calendar.setUTCDate(calendar.getUTCDate()+days);
 return [calendar.getUTCFullYear(),calendar.getUTCMonth()+1,calendar.getUTCDate()];
}
// The model may identify a new date/time, but cannot silently replace the part
// the user did not request changing. All arithmetic uses the contact's zone.
export function preserveRescheduleParts(intent:AIInterpretation,text:string,context:any,receivedAt:Date){
 if(!["reschedule_reminder","reschedule_appointment"].includes(intent.action))return;
 const s=normalize(text),day=statedDay(s),clock=explicitClock(text);
 if(!clock && /\b(?:manha|tarde|noite|madrugada)\b/.test(s)){
  intent.datetime=null;intent.draft=null;
  try{
   const date=day?simpleDay(s,receivedAt,context?.user?.timezone || "America/Sao_Paulo"):null;
   if(date)intent.draft={date:`${date[0]}-${String(date[1]).padStart(2,"0")}-${String(date[2]).padStart(2,"0")}`,time:null};
  }catch{}
  return;
 }
 if(day && clock)return;
 const appointment=intent.action==="reschedule_appointment";
 const id=appointment?intent.appointmentId:intent.reminderId;
 const focused=appointment?context?.conversationState?.focusedAppointment:context?.conversationState?.focusedReminder;
 const collection=appointment?context?.appointments:context?.reminders;
 const rows=[...(focused?[focused]:[]),...(Array.isArray(collection)?collection:[])];
 const unique=[...new Map(rows.filter((r:any)=>r?.id).map((r:any)=>[r.id,r])).values()] as any[];
 const candidates=id?unique.filter(r=>r.id===id):intent.search?unique.filter(r=>normalize(r.title || "")===normalize(intent.search!)):[];
 const target=candidates.length===1?candidates[0]:null;
 const original=target && (appointment?target.startsAt:target.remindAt);
 if(!original || target.state!=="active" || !Number.isFinite(new Date(original).getTime()) || !day && !clock){intent.datetime=null;return;}
 const zone=context?.user?.timezone || "America/Sao_Paulo";
 try{
  const old=localCalendarParts(new Date(original),zone);
  let proposed:Date|null=null;
  if(intent.datetime){try{proposed=parseTimestamp(intent.datetime);}catch{intent.datetime=null;return;}}
  if(day && !clock){
   const date=simpleDay(s,receivedAt,zone) || (proposed?localCalendarParts(proposed,zone).slice(0,3):null);
   intent.datetime=date?localCalendarInstant([...date,...old.slice(3)],zone).toISOString():null;
  }else if(clock && !day){
   const pending=context?.conversationState?.pendingRequest;
   const pendingId=appointment?pending?.appointmentId:pending?.reminderId;
   const date=pending?.action===intent.action && pendingId===target.id && typeof pending?.draft?.date==="string" && /^\d{4}-\d{2}-\d{2}$/.test(pending.draft.date)?pending.draft.date.split("-").map(Number):old.slice(0,3);
   intent.datetime=proposed?localCalendarInstant([...date,...localCalendarParts(proposed,zone).slice(3)],zone).toISOString():null;
  }
  const version=appointment?target.version:target.scheduleVersion;
  if(intent.datetime && Number.isSafeInteger(version))intent.expectedVersion=version;
 }catch{intent.datetime=null;}
}
