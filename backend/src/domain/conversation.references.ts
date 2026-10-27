import type { AIInterpretation } from "../types/ai.types";
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export const mentionsName=(text:string,name:string)=>!!normalize(name) && (` ${normalize(text)} `).includes(` ${normalize(name)} `);
export function matchingSubjects(text:string,subjects:any[]){
 const s=normalize(text),client=/\bcliente\b/.test(s),project=/\bprojeto\b/.test(s);
 const kind=client!==project?client?"client":"project":null;
 return subjects.filter(subject=>typeof subject.name==="string" && mentionsName(text,subject.name) && (!kind || subject.kind===kind));
}

// Reading a pronoun is safe only when the recent conversation has one explicit,
// persisted subject. Never choose a client because it happens to be first.
export function guardSubjectReference(intent:AIInterpretation,text:string,context:any){
 const s=normalize(text),subjects=Array.isArray(context?.subjects)?context.subjects:[];
 const explicit=matchingSubjects(text,subjects);
 const focused=context?.conversationState?.focusedSubject;
 const pronoun=/\b(?:dele|dela|desse cliente|dessa cliente|desse projeto|dessa empresa|com ele|com ela)\b/.test(s);
 const target=explicit.length===1?explicit[0]:explicit.length===0 && pronoun?focused:null;
 if(["propose_subject_update","create_subject_pending","update_subject_pending","list_subject_pendings"].includes(intent.action) && explicit.length>1){intent.action="conversation";intent.subject=null;intent.reply="De qual cliente ou projeto você quer tratar a pendência?";return;}
 if(["propose_subject_update","create_subject_pending","update_subject_pending"].includes(intent.action) && explicit.length===1){intent.subject=explicit[0].name;intent.subjectKind=explicit[0].kind==="project"?"project":"client";}
 if(intent.action==="list_subject_pendings" && target){intent.subject=target.name;intent.subjectKind=target.kind==="project"?"project":"client";}
 if(target && /\b(?:cliente|projeto)\b/.test(s) && ["subject_overview","agenda_overview","search_facts","list_reminders"].includes(intent.action)){intent.subjectKind=target.kind==="project"?"project":"client";}
 const agendaRead=!/\b(?:nao|nunca)\b/.test(s) && (/^(?:e )?(?:a )?agenda\b/.test(s) || /\b(?:como esta|como ficou|qual e|mostra|mostre|consultar|consulta|ver)\b.*\bagenda\b/.test(s));
 const overview=agendaRead || /\b(?:o que (?:eu )?(?:tenho|tem|temos|ficou)|me (?:mostra|mostre|traz)|resumo|pendencias|pendente)\b/.test(s);
 const factual=/\b(?:orcamento|valor|prazo|status|telefone|endereco)\b/.test(s) && /\b(?:qual|quanto|mostra|mostre|diga)\b/.test(s);
 if(intent.action==="conversation" && (overview || factual) && (explicit.length>1 || pronoun && !target)){
  intent.subject=null;intent.reply="De qual cliente ou projeto você está falando?";return;
 }
 if(intent.action==="conversation" && overview && target){
  intent.action="subject_overview";intent.subject=target.name;intent.subjectKind=target.kind==="project"?"project":"client";
  intent.title=null;intent.description=null;intent.datetime=null;return;
 }
 if(!["search_facts","subject_overview","agenda_overview","list_reminders","list_subject_pendings"].includes(intent.action) || !pronoun)return;
 if(explicit.length>1 || !target){
  intent.action="conversation";intent.subject=null;intent.factKey=null;
  intent.reply="De qual cliente ou projeto você está falando?";return;
 }
 // Explicit names win. A model cannot silently switch the referent of “dela”.
 intent.subject=target.name;intent.subjectKind=target.kind==="project"?"project":"client";
}
