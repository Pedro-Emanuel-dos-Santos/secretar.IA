import type { AIInterpretation } from "../types/ai.types";

export function explicitClock(text:string){
 const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const hour='(?:\\d{1,2}|uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte(?: e (?:uma|duas|tres))?)';
 const minute='(?:\\d{1,2}|meia|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|(?:vinte|trinta|quarenta|cinquenta)(?: e (?:um|dois|tres|quatro|cinco|seis|sete|oito|nove))?)';
 return /\b\d{1,2}(?:h(?:\d{2})?|:\d{2})\b|\bmeio[ -]dia\b|\bmeia[ -]noite\b/.test(s)
  || new RegExp('\\b(?:as|pelas|umas|por volta das)\\s+'+hour+'\\b').test(s)
  || new RegExp('^(?:(?:melhor|na verdade|para|pode ser|isso,?)\\s+)?'+hour+'(?:\\s+horas?)?(?:\\s+e\\s+'+minute+')?(?:\\s+(?:da|de|a)\\s+(?:manha|tarde|noite|madrugada))?[.!?]?\\s*$').test(s);
}
export function guardUnstatedTime(intent:AIInterpretation,text:string,context:any){
 if(!["create_reminder","create_appointment"].includes(intent.action) || !intent.datetime)return;
 const pending=context?.conversationState?.pendingRequest;
 if(explicitClock(text) || pending?.draft?.time)return;
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const statedDay=/\b(?:amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\b\d{1,2}\/\d{1,2}\b/.test(normalized);
 let date=pending?.draft?.date || null;
 if(statedDay && Number.isFinite(new Date(intent.datetime).getTime())){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(intent.datetime));
  const part=(type:string)=>parts.find(p=>p.type===type)?.value;
  date=`${part('year')}-${part('month')}-${part('day')}`;
 }
 intent.datetime=null;intent.draft={date,time:null};
}

export function guardCorrectionTarget(intent:AIInterpretation,text:string,context:any){
 const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const appointment=context?.conversationState?.focusedAppointment;
 if(appointment?.state==="active" && ["create_reminder","create_appointment"].includes(intent.action) && /^(?:melhor|na verdade)[, ]/.test(s) && explicitClock(text)){intent.action="reschedule_appointment";intent.appointmentId=appointment.id;intent.search=null;intent.title=null;return;}
 const focused=context?.conversationState?.focusedReminder;
 if(intent.action!=="create_reminder" || !focused?.id || focused.state!=="active")return;
 if(!/^(?:melhor|na verdade)[, ]+(?:(?:as|para|umas)\s+)?(?:\d|uma\b|duas\b|tres\b|quatro\b|cinco\b|seis\b|sete\b|oito\b|nove\b|dez\b|onze\b|doze\b|treze\b|quinze\b|vinte\b)/.test(s) || !explicitClock(text))return;
 intent.action="reschedule_reminder";intent.reminderId=focused.id;intent.search=null;intent.title=null;
 intent.recurrence=null;intent.cancelSeries=false;
}
