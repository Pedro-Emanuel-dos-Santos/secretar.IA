import type { AIInterpretation } from "../types/ai.types";
import type { AgendaPeriod } from "./agenda.overview";
import { explicitClock } from "./conversation.timing";
export function detectedAgendaPeriod(text:string):AgendaPeriod|"ambiguous"|null{
 const s=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const found:AgendaPeriod[]=[];
 if(/\bproximos (?:sete|7) dias\b/.test(s))found.push("next_7_days");
 if(/\b(?:proxima semana|semana que vem)\b/.test(s))found.push("next_week");
 if(/\b(?:(?:esta|essa|nesta|nessa|desta|dessa|minha) semana)\b/.test(s))found.push("week");
 if(/\bhoje\b/.test(s))found.push("today");
 if(/\bamanha\b/.test(s) && !/\bdepois de amanha\b/.test(s))found.push("tomorrow");
 return found.length>1?"ambiguous":found[0] || null;
}
export function guardSubjectPeriod(intent:AIInterpretation,text:string){
 if(!["subject_overview","agenda_overview"].includes(intent.action))return;
 if(explicitClock(text) && !(intent.rangeStart && intent.rangeEnd)){intent.action="conversation";intent.reply="Você quer consultar um horário específico? Diga o dia e o início e fim do intervalo para eu não mostrar registros fora dele.";return;}
 const period=detectedAgendaPeriod(text);
 if(period==="ambiguous"){
  intent.action="conversation";intent.reply="Qual período você quer consultar primeiro? Hoje, amanhã, esta semana, a próxima semana ou os próximos sete dias?";return;
 }
 if(period && !intent.rangeStart && !intent.rangeEnd){intent.agendaPeriod=period;return;}
 const s=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 if(intent.action==="subject_overview" && !intent.agendaPeriod && !intent.rangeStart && !intent.rangeEnd && /\b(?:semana|mes|amanha|hoje|dias|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b|\bdia\s+(?:\d{1,2}|primeiro|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta)\b/.test(s)){
  intent.action="conversation";intent.reply="Qual é o período dessa consulta? Pode dizer as datas de início e fim, ou escolher hoje, amanhã, esta semana ou a próxima semana.";
 }
}
