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
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const spokenDay=/\bdia\s+(?:primeiro|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta)(?:\s+e\s+(?:um|dois|tres|quatro|cinco|seis|sete|oito|nove))?\b/.test(normalized);
 const statedDay=spokenDay || /\b(?:amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\b|\bdia\s+\d{1,2}\b|\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b(?:daqui a|em)\s+(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete)\s+dias?\b/.test(normalized);
 const statedClock=explicitClock(text) || !!pending?.draft?.time;
 let date=pending?.draft?.date || null;
 let time=pending?.draft?.time || null;
 const focused=context?.conversationState?.focusedAppointment;
 if(!date && /\b(?:no mesmo dia|nesse dia|no dia da reuniao)\b/.test(normalized) && focused?.startsAt && Number.isFinite(new Date(focused.startsAt).getTime())){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:context?.user?.timezone || 'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(focused.startsAt));
  const part=(type:string)=>parts.find(p=>p.type===type)?.value;
  date=`${part('year')}-${part('month')}-${part('day')}`;
 }
 if(Number.isFinite(new Date(intent.datetime).getTime())){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:context?.user?.timezone || 'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(intent.datetime));
  const part=(type:string)=>parts.find(p=>p.type===type)?.value;
  if(statedDay)date=`${part('year')}-${part('month')}-${part('day')}`;
  if(explicitClock(text))time=`${part('hour')}:${part('minute')}`;
 }
 if(date && statedClock)return;
 intent.datetime=null;intent.draft={date,time:statedClock?time:null};
}

export function guardCorrectionTarget(intent:AIInterpretation,text:string,context:any){
 const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const appointment=context?.conversationState?.focusedAppointment;
 const focused=context?.conversationState?.focusedReminder;
 // A proposed correction phrased as a question is not permission to change the
 // focused item, even when the model guessed a mutating action.
 if(/^(?:melhor|na verdade)[, ]/.test(s) && /[?]|\b(?:nao|nunca|talvez|se)\b/.test(s) && ["create_reminder","create_appointment","reschedule_reminder","reschedule_appointment"].includes(intent.action)){
  intent.action="conversation";intent.reminderId=null;intent.appointmentId=null;intent.datetime=null;intent.draft=undefined;
  intent.reply="Não alterei o agendamento. Você quer confirmar esse novo horário?";return;
 }
 // A complete day-only correction continues the existing item, even when the
 // model labels it as conversation or creation. Never guess between two items.
 const dayCorrection=/^(?:melhor|na verdade)[, ]+(?:(?:para|pra|fica para|fica pra)\s+)?(?:hoje|amanha|depois de amanha|(?:segunda|terca|quarta|quinta|sexta)(?:-feira)?|sabado|domingo)[.!]*$/.test(s);
 if(dayCorrection && !context?.conversationState?.pendingRequest && ["conversation","create_reminder","create_appointment"].includes(intent.action)){
  const targets=[...(focused?.id && focused.state==="active"?[{kind:"task",record:focused}]:[]),...(appointment?.id && appointment.state==="active"?[{kind:"appointment",record:appointment}]:[])];
  if(targets.length!==1){
   intent.action="conversation";intent.title=null;intent.datetime=null;intent.draft=undefined;
   intent.reminderId=null;intent.appointmentId=null;
   intent.reply=targets.length?"Qual tarefa ou compromisso você quer mudar?":"O que você quer passar para esse dia?";
   return;
  }
  const target=targets[0];
  intent.action=target.kind==="task"?"reschedule_reminder":"reschedule_appointment";
  intent.reminderId=target.kind==="task"?target.record.id:null;
  intent.appointmentId=target.kind==="appointment"?target.record.id:null;
  intent.title=null;intent.search=null;intent.datetime=null;intent.draft=undefined;
  intent.recurrence=null;intent.cancelSeries=false;
  return;
 }
 if(appointment?.state==="active" && ["create_reminder","create_appointment"].includes(intent.action) && /^(?:melhor|na verdade)[, ]/.test(s) && explicitClock(text)){intent.action="reschedule_appointment";intent.appointmentId=appointment.id;intent.search=null;intent.title=null;return;}
 if(intent.action!=="create_reminder" || !focused?.id || focused.state!=="active")return;
 if(!/^(?:melhor|na verdade)[, ]+(?:(?:as|para|umas)\s+)?(?:\d|uma\b|duas\b|tres\b|quatro\b|cinco\b|seis\b|sete\b|oito\b|nove\b|dez\b|onze\b|doze\b|treze\b|quinze\b|vinte\b)/.test(s) || !explicitClock(text))return;
 intent.action="reschedule_reminder";intent.reminderId=focused.id;intent.search=null;intent.title=null;
 intent.recurrence=null;intent.cancelSeries=false;
}
