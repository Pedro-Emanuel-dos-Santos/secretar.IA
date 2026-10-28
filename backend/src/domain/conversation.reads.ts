import type { AIInterpretation } from "../types/ai.types";
import { matchingSubjects } from "./conversation.references";
import { detectedAgendaPeriod } from "./agenda.period";
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

// A past confirmation is conversation history, not the current schedule.
export function guardAppointmentLookup(intent:AIInterpretation,text:string,context:any){
  if(!["conversation","list_appointments"].includes(intent.action))return;
  const s=normalized(text);
  if(!/\b(?:reuniao|reunioes|compromisso|compromissos|consulta|consultas)\b/.test(s) ||
     !/\b(?:como (?:ficou|esta|ficaram|estao)|que horas|qual (?:e )?(?:o )?horario|quando|me (?:mostra|mostre|diga)|tenho|minha agenda)\b/.test(s) ||
     /\b(?:muda|mude|mudar|altera|altere|alterar|cancela|cancele|cancelar|marca|marque|marcar|agenda|agende|agendar|reagenda|reagende|reagendar|cria|crie|criar|adiciona|adicione|adicionar)\b/.test(s))return;
  const period=detectedAgendaPeriod(text);
  if(period==="ambiguous"){
    intent.action="conversation";intent.reply="Qual dia você quer consultar primeiro?";return;
  }
  if(period){
    intent.action="agenda_overview";intent.agendaPeriod=period;
    intent.rangeStart=null;intent.rangeEnd=null;intent.subject=null;intent.appointmentId=null;
  }else{
    // Do not replace an explicit date or named event with the conversation focus.
    if(/\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo|dia|semana|mes)\b|\d/.test(s))return;
    const focused=context?.conversationState?.focusedAppointment;
    if(!focused || focused.state!=="active" || !/^(?:como (?:ficou|esta) (?:a |minha |essa |aquela )?(?:reuniao|consulta|compromisso)|(?:que horas|quando) (?:e |ficou |esta )?(?:a |minha |essa |aquela )?(?:reuniao|consulta|compromisso))[?.!]*$/.test(s.trim()))return;
    intent.action="list_appointments";intent.appointmentId=focused.id;
    intent.rangeStart=null;intent.rangeEnd=null;
  }
  intent.reply="Vou consultar o agendamento atual.";intent.datetime=null;intent.title=null;intent.description=null;
}

// Ground common factual questions in persisted records even if the model
// answers directly from a stale conversation. Do not classify open advice.
export function guardFactLookup(intent:AIInterpretation,text:string,context:any){
  if(!["conversation","search_facts","subject_overview","list_subject_pendings"].includes(intent.action))return;
  const s=normalized(text);
  const historyQuery=/\b(?:o que mudou|historico|ultimas atualizacoes)\b/.test(s);
  if(historyQuery && !/\b(?:apaga|apague|exclui|exclua|remove|remova|esquece|esqueca)\b/.test(s)){
    let matches=matchingSubjects(text,Array.isArray(context?.subjects)?context.subjects:[]);
    if(!matches.length && /\b(?:dele|dela|desse projeto|nesse projeto|desse cliente|nesse cliente)\b/.test(s) && context?.conversationState?.focusedSubject)matches=[context.conversationState.focusedSubject];
    if(matches.length===1){
      intent.action="search_facts";intent.subject=matches[0].name;intent.subjectKind=matches[0].kind==="project"?"project":"client";
      intent.includeHistory=true;
      intent.factKey=/\b(?:orcamento|valor)\b/.test(s)?"orcamento":/\bprazo\b/.test(s)?"prazo":/\bstatus\b/.test(s)?"status":/\btelefone\b/.test(s)?"telefone":/\bendereco\b/.test(s)?"endereco":null;
      intent.title=null;intent.description=null;intent.datetime=null;
      return;
    }
    if(matches.length>1 || /\b(?:projeto|cliente)\b/.test(s)){
      intent.action="conversation";intent.subject=null;intent.factKey=null;
      intent.reply="De qual cliente ou projeto você quer consultar o histórico? Diga o nome completo.";return;
    }
  }
  if(intent.action!=="conversation")return;
  if(!/\b(?:qual (?:e |era |foi )?(?:o |a )?(?:valor|orcamento|prazo|status|telefone|endereco)|quanto (?:e|era|foi|ficou)|historico (?:do|da)|me (?:mostra|diga) (?:o |a )?(?:valor|orcamento|prazo|status))\b/.test(s))return;
  let subjects=matchingSubjects(text,Array.isArray(context?.subjects)?context.subjects:[]);
  if(!subjects.length && /\b(?:dele|dela|desse cliente|dessa cliente|desse projeto)\b/.test(s) && context?.conversationState?.focusedSubject)subjects=[context.conversationState.focusedSubject];
  if(subjects.length!==1)return;
  const key=/\b(?:valor|orcamento)\b/.test(s)?"orcamento":/\bprazo\b/.test(s)?"prazo":/\bstatus\b/.test(s)?"status":/\btelefone\b/.test(s)?"telefone":/\bendereco\b/.test(s)?"endereco":null;
  if(!key)return;
  intent.action="search_facts";intent.subject=subjects[0].name;intent.subjectKind=subjects[0].kind==="project"?"project":"client";
  intent.factKey=key;intent.includeHistory=/\b(?:anterior|historico|antes)\b/.test(s);
  intent.title=null;intent.description=null;intent.datetime=null;
}
