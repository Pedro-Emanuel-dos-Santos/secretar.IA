import type { AIInterpretation } from "../types/ai.types";

// Only complete, explicit read requests. Compound requests stay with the normal
// interpreter so an additional instruction is not silently discarded.
export function subjectHistoryLookup(text:string):AIInterpretation|null{
 const clean=text.trim().replace(/[?.!]+$/,"").trim();
 const match=clean.match(/^(?:o que mudou (?:no|na)|hist[oó]rico (?:do|da)|(?:mostra|mostre) (?:o )?hist[oó]rico (?:do|da)) (projeto|cliente) (.+)$/iu);
 if(!match)return null;
 const name=match[2].trim(),normalized=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 if(!name || name.length>120 || /[\n\r,;:?!]|\b(?:e|tambem|depois|mas|nao|cria|crie|apaga|apague|altera|altere|lembra|lembre|avisa|avise)\b/.test(normalized))return null;
 return {action:"search_facts",subject:name,subjectKind:match[1].toLowerCase()==="projeto"?"project":"client",includeHistory:true,factKey:null,title:null,description:null,datetime:null,amount:null,category:null,reply:"Vou consultar o histórico registrado."};
}
