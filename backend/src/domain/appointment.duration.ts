import type {AIInterpretation} from "../types/ai.types";
import {localCalendarParts,localCalendarInstant} from "./recurrence";
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const numbers:Record<string,number>={uma:1,um:1,duas:2,dois:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,quinze:15,vinte:20,trinta:30,quarenta:40,cinquenta:50,meia:0.5};
const amount=(s:string)=>numbers[s] ?? Number(s.replace(",","."));
// Same-day clock ranges only. Inverted, qualified or multiple intervals must
// be clarified rather than assuming an AM/PM or midnight crossing.
function statedRange(s:string):{start:number;end:number}|null|undefined{
 if(!/\b(?:das|de)\s+\d{1,2}(?:h(?:\d{2})?|:\d{2})?\s*(?:as|ate)\b/.test(s))return undefined;
 const matches=[...s.matchAll(/\b(?:das|de)\s+(\d{1,2})(?:h(\d{2})?|:(\d{2}))?\s*(?:as|ate(?: as)?)\s+(\d{1,2})(?:h(\d{2})?|:(\d{2}))?\b/g)];
 if(matches.length!==1 || /\b(?:manha|tarde|noite|madrugada|dia seguinte)\b/.test(s))return null;
 const m=matches[0],a=Number(m[1]),b=Number(m[4]),am=Number(m[2]||m[3]||0),bm=Number(m[5]||m[6]||0),start=a*60+am,end=b*60+bm;
 return a<=23 && b<=23 && am<=59 && bm<=59 && end>start?{start,end}:null;
}
// Duration must be about the event, never the lead time of a notification.
export function statedAppointmentDuration(text:string):number|null{
 const s=normalize(text),range=statedRange(s);
 if(range===null)return null;
 const expression=/\b(?:duracao\s+(?:(?:de|para)\s+)?|(?:vai\s+)?durar?\s+|durando\s+|durante\s+|por\s+|(?:reuniao|consulta|visita|aula|atendimento|compromisso)\s+de\s+)(\d+(?:[.,]\d+)?|uma|um|duas|dois|tres|quatro|meia)\s*(minutos?|horas?)(?:\s+e\s+(meia|(?:\d+|quinze|vinte|trinta|quarenta|cinquenta)\s+minutos?))?\b/g;
 const matches=[...s.matchAll(expression)].filter(m=>!/^\s*(?:antes|de antecedencia|depois)\b/.test(s.slice(m.index!+m[0].length)));
 if(!matches.length)return range?range.end-range.start:null;
 if(matches.length!==1)return null;
 const m=matches[0];
 if(/^\s+(?:e|horas?|minutos?)\b/.test(s.slice(m.index!+m[0].length)) || m[3] && !m[2].startsWith("hora"))return null;
 const n=amount(m[1]),duration=m[2].startsWith("hora")?n*60+(m[3]?(m[3]==="meia"?30:amount(m[3].replace(/\s+minutos?$/,""))):0):n;
 return range && duration!==range.end-range.start?null:duration;
}
export function guardAppointmentDuration(intent:AIInterpretation,text:string,context?:any){
 if(!["create_appointment","reschedule_appointment"].includes(intent.action))return;
 const s=normalize(text),range=statedRange(s);
 let duration=statedAppointmentDuration(text);
 const clarify=()=>{intent.action="conversation";intent.datetime=null;intent.draft=null;intent.reply="Qual é a duração do compromisso? Informe um intervalo sem ambiguidade ou a duração, de 1 minuto a 24 horas.";delete intent.durationMinutes;};
 if(range===null){clarify();return;}
 if(range && intent.datetime){
  try{
   const start=new Date(intent.datetime),zone=context?.user?.timezone || "America/Sao_Paulo",parts=localCalendarParts(start,zone);
   if(parts[3]*60+parts[4]!==range.start || duration===null){clarify();return;}
   // The model cannot choose one occurrence of a repeated local start time.
   if(localCalendarInstant(parts,zone).getTime()!==start.getTime()){clarify();return;}
   const end=localCalendarInstant([...parts.slice(0,3),Math.floor(range.end/60),range.end%60,0],zone);
   duration=(end.getTime()-start.getTime())/60000;
  }catch{clarify();return;}
 }
 if(duration===null){
  const pending=context?.conversationState?.pendingRequest;
  const matching=pending?.action===intent.action && (intent.action==="reschedule_appointment"?pending.appointmentId===intent.appointmentId:pending.title===intent.title);
  if(matching && /^(?:\d+(?:[.,]\d+)?|uma|um|duas|dois|tres|quatro|meia)\s*(?:minutos?|horas?)(?:\s+e\s+(?:meia|\d+|quinze|vinte|trinta)(?:\s+minutos?)?)?[.!]*$/.test(s)){
   duration=statedAppointmentDuration("duração de "+s);
   if(duration!==null && Number.isSafeInteger(duration) && duration>=1 && duration<=1440){intent.durationMinutes=duration;return;}
   clarify();return;
  }
  if(/\b(?:duracao|durar|durando|durante|por)\s+.*(?:minutos?|horas?)\b/.test(s) && !/\b(?:antes|antecedencia|depois)\b/.test(s)){clarify();return;}
  const carried=matching?pending.durationMinutes:null;
  if(carried!==null && Number.isSafeInteger(carried) && carried>=1 && carried<=1440)intent.durationMinutes=carried;
  else delete intent.durationMinutes;
  return;
 }
 if(Number.isSafeInteger(duration) && duration>=1 && duration<=1440)intent.durationMinutes=duration;
 else {intent.action="conversation";intent.datetime=null;intent.reply="Qual é a duração do compromisso? Posso registrar de 1 minuto a 24 horas.";delete intent.durationMinutes;}
}
