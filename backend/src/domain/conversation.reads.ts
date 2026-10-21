import type { AIInterpretation } from "../types/ai.types";
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

// Ground common factual questions in persisted records even if the model
// answers directly from a stale conversation. Do not classify open advice.
export function guardFactLookup(intent:AIInterpretation,text:string,context:any){
  if(intent.action!=="conversation")return;
  const s=normalized(text);
  if(!/\b(?:qual (?:e |era |foi )?(?:o |a )?(?:valor|orcamento|prazo|status|telefone|endereco)|quanto (?:e|era|foi|ficou)|historico (?:do|da)|me (?:mostra|diga) (?:o |a )?(?:valor|orcamento|prazo|status))\b/.test(s))return;
  const subjects=(Array.isArray(context?.subjects)?context.subjects:[]).filter((subject:any)=>typeof subject.name==="string" && s.includes(normalized(subject.name)));
  if(subjects.length!==1)return;
  const key=/\b(?:valor|orcamento)\b/.test(s)?"orcamento":/\bprazo\b/.test(s)?"prazo":/\bstatus\b/.test(s)?"status":/\btelefone\b/.test(s)?"telefone":/\bendereco\b/.test(s)?"endereco":null;
  if(!key)return;
  intent.action="search_facts";intent.subject=subjects[0].name;intent.subjectKind=subjects[0].kind==="project"?"project":"client";
  intent.factKey=key;intent.includeHistory=/\b(?:anterior|historico|antes)\b/.test(s);
  intent.title=null;intent.description=null;intent.datetime=null;
}
