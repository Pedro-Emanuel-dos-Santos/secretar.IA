import type {AIInterpretation} from "../types/ai.types";
import {normalizeContext} from "./context.relevance";
import {mentionsName} from "./conversation.references";

export function guardStorageOptOut(intent:AIInterpretation,text:string){
 const s=normalizeContext(text);
 const refused=/\b(?:nao|nunca|sem)\s+(?:(?:quero|precisa|deve|pode)\s+)?(?:que\s+)?(?:voce\s+)?(?:guarda|guarde|guardar|memoriza|memorize|memorizar|anota|anote|anotar|salva|salve|salvar|registra|registre|registrar|armazena|armazene|armazenar)\b/.test(s);
 if(!refused || !(["save_note","edit_note","remember_personal","update_personal","save_fact","propose_subject_update"].includes(intent.action) || intent.action==="assistant_plan" && intent.planSteps?.some(step=>step.action==="save_note")))return;
 intent.action="conversation";intent.planSteps=undefined;intent.title=null;intent.description=null;intent.datetime=null;intent.reply="Não salvei essa informação como memória ou anotação. Podemos conversar sobre o assunto sem criar esse registro.";
}

export function guardContextCorrection(intent:AIInterpretation,text:string,context:any){
 const s=normalizeContext(text);
 if(!/^na verdade\b/.test(s) || context?.conversationState?.pendingRequest || !["create_reminder","create_appointment","reschedule_reminder","reschedule_appointment"].includes(intent.action))return;
 const state=context?.conversationState;
 const focused=[state?.focusedReminder,state?.focusedAppointment].filter(r=>r?.state==="active");
 // An appointment and its own notification are one conversational target.
 // Keep independent tasks with the same title ambiguous; only collapse links
 // proven by the current appointment's reminder IDs, never by title similarity.
 const appointments=Array.isArray(context?.appointments)?context.appointments:[];
 const childAlerts=new Set(appointments.flatMap((a:any)=>(a.reminders || []).map((r:any)=>r.id)));
 const named=[...appointments,...(context?.reminders || []).filter((r:any)=>!childAlerts.has(r.id))].filter(r=>r?.title && mentionsName(text,r.title));
 if(named.length===1)return;
 if(focused.length!==1 || /[?]|\b(?:nao|nunca|talvez|se)\b/.test(s)){
  intent.action="conversation";intent.reminderId=null;intent.appointmentId=null;intent.datetime=null;intent.search=null;intent.draft=null;
  intent.reply="Qual tarefa ou compromisso mudou? Preciso identificar o registro antes de alterar o horário.";return;
 }
 const target=focused[0],appointment=target===state.focusedAppointment;
 intent.action=appointment?"reschedule_appointment":"reschedule_reminder";intent.appointmentId=appointment?target.id:null;intent.reminderId=appointment?null:target.id;intent.search=null;intent.title=null;
 intent.expectedVersion=appointment?target.version:target.scheduleVersion;
}
