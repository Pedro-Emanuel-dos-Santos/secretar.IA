import type { AIInterpretation } from "../types/ai.types";

// Only direct commands with a short demonstrative reference. Named searches,
// questions, conditional phrases and combined requests remain with the model.
export function guardCurrentTarget(intent:AIInterpretation,text:string,context:any){
 if(intent.selectionListId || context?.conversationState?.pendingRequest)return;
 const s=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
 const fail=()=>{intent.action="conversation";intent.reminderId=null;intent.appointmentId=null;intent.search=null;intent.datetime=null;intent.draft=null;intent.reply="Qual tarefa ou compromisso você quer alterar?";};
 if(/[?]/.test(s) || /\b(?:nao|nunca|talvez|se|tambem)\b/.test(s)){
  if(/\b(?:esse|essa|este|esta|aquele|aquela|isso|ele|ela)\b/.test(s) && ["cancel_reminder","complete_reminder","reschedule_reminder","cancel_appointment","reschedule_appointment"].includes(intent.action)){
   fail();intent.reply="Não alterei nada. Diga qual item e o que você quer fazer com ele.";
  }
  return;
 }
 const match=s.match(/^(?:por favor[, ]+|pode\s+)?(cancela|cancele|cancelar|adia|adie|adiar|reagenda|reagende|muda|mude|conclui|conclua|concluir|finaliza|finalize|finalizar)\s+(esse|essa|este|esta|aquele|aquela|isso|ele|ela)(?:\s+(lembrete|tarefa|compromisso|reuniao))?(?=$|[.! ,]|\s+(?:para|pra|em|por|daqui|amanha|hoje|depois)\b)/);
 if(!match)return;
 const rest=s.slice(match[0].length).trim();
 // A title qualifier means the person named a different target, not just “it”.
 if(rest && !/^(?:para|pra|em|por|daqui|amanha|hoje|depois)\b|^[.!]+$/.test(rest))return;
 if(/\be\s+(?:cancela|cria|marca|conclui|adia|reagenda|muda)\b/.test(rest))return;
 const state=context?.conversationState;
 const task=state?.focusedReminder,appointment=state?.focusedAppointment;
 const target=task?.state==="active" && !appointment?task:appointment?.state==="active" && !task?appointment:null;
 const kind=match[3],wantsAppointment=kind==="compromisso" || kind==="reuniao",wantsTask=kind==="lembrete" || kind==="tarefa";
 if(!target || wantsAppointment && !appointment || wantsTask && !task){fail();return;}
 const cancel=match[1].startsWith("cancel"),complete=/^(?:conclu|finaliz)/.test(match[1]);
 if(complete && appointment){fail();return;}
 intent.action=appointment?(cancel?"cancel_appointment":"reschedule_appointment"):(cancel?"cancel_reminder":complete?"complete_reminder":"reschedule_reminder");
 intent.reminderId=task?target.id:null;intent.appointmentId=appointment?target.id:null;
 intent.search=null;intent.title=null;intent.cancelSeries=false;intent.recurrence=null;
 if(cancel || complete){intent.datetime=null;intent.draft=null;}
 if(appointment && !/\b(?:avis\w*|lembr\w*)\b/.test(s))delete intent.alertMinutes;
 const version=appointment?target.version:target.scheduleVersion;
 if(Number.isSafeInteger(version))intent.expectedVersion=version;
}
