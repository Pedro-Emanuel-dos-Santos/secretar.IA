import type {AIInterpretation} from "../types/ai.types";
// Duration must be about the event, never the lead time of a notification.
export function statedAppointmentDuration(text:string):number|null{
 const s=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const expression=/\b(?:duracao\s+(?:(?:de|para)\s+)?|(?:vai\s+)?durar?\s+|durando\s+|durante\s+|por\s+|(?:reuniao|consulta|visita|aula|atendimento|compromisso)\s+de\s+)(\d+(?:[.,]\d+)?|uma|um|duas|dois|tres|quatro|meia)\s*(minutos?|horas?)(\s+e meia)?\b/g;
 const matches=[...s.matchAll(expression)].filter(m=>!/^\s*(?:antes|de antecedencia|depois)\b/.test(s.slice(m.index!+m[0].length)));
 if(matches.length!==1)return null;
 const m=matches[0],numbers:Record<string,number>={uma:1,um:1,duas:2,dois:2,tres:3,quatro:4,meia:0.5};
 const n=numbers[m[1]] ?? Number(m[1].replace(",","."));
 return m[2].startsWith("hora")?n*60+(m[3]?30:0):n;
}
export function guardAppointmentDuration(intent:AIInterpretation,text:string,context?:any){
 if(!["create_appointment","reschedule_appointment"].includes(intent.action))return;
 const duration=statedAppointmentDuration(text);
 if(duration===null){
  const pending=context?.conversationState?.pendingRequest;
  const matching=pending?.action===intent.action && (intent.action==="reschedule_appointment"?pending.appointmentId===intent.appointmentId:pending.title===intent.title);
  const carried=matching?pending.durationMinutes:null;
  if(carried!==null && Number.isSafeInteger(carried) && carried>=1 && carried<=1440)intent.durationMinutes=carried;
  else delete intent.durationMinutes;
  return;
 }
 if(Number.isSafeInteger(duration) && duration>=1 && duration<=1440)intent.durationMinutes=duration;
 else {intent.action="conversation";intent.datetime=null;intent.reply="Qual é a duração do compromisso? Posso registrar de 1 minuto a 24 horas.";delete intent.durationMinutes;}
}
