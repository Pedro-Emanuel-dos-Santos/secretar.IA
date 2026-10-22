import type { Prisma,PrismaClient } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { personalMemoryConsent,memoryDisclosure } from "./personal.memory.consent";

export const personalMemoryActions=new Set(["remember_personal","recall_personal","update_personal","forget_personal"]);
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const types=["routine","preference","person","goal"];
type Store=Pick<PrismaClient,"event">;
export type PersonalMemory={id:string;kind:string;label:string;text:string;version:number;updatedAt:string;sourceMessageId:string};
function decode(row:{id:string;payload:unknown}):PersonalMemory|null{
 const p=row.payload as Record<string,unknown>;
 return p && types.includes(String(p.kind)) && typeof p.label==="string" && typeof p.text==="string" && typeof p.sourceMessageId==="string" && typeof p.updatedAt==="string" && Number.isSafeInteger(p.version)
  ?{id:row.id,kind:String(p.kind),label:p.label,text:p.text,version:Number(p.version),updatedAt:p.updatedAt,sourceMessageId:p.sourceMessageId}:null;
}
const scope=(phone:string,phoneNumberId:string)=>({type:"personal_memory",user:{phone},payload:{path:["phoneNumberId"],equals:phoneNumberId}});
export async function findPersonalMemories(store:Store,phone:string,phoneNumberId:string,search=""){
 const words=normalize(search).split(/[^a-z0-9]+/).filter(w=>w && !["a","o","as","os","de","da","do","das","dos","com","para","meu","minha"].includes(w)).slice(0,12);
 const rows=await store.event.findMany({where:{AND:[scope(phone,phoneNumberId),...words.map(word=>({payload:{path:["searchText"],string_contains:word}}))]},orderBy:[{createdAt:"desc"},{id:"desc"}],take:11});
 return rows.flatMap(row=>{const memory=decode(row);return memory?[memory]:[];});
}
export function personalMemoryReply(memories:PersonalMemory[]){
 if(!memories.length)return "Não encontrei essa informação na sua memória pessoal.";
 let reply="Você me pediu para guardar:\n";
 for(const memory of memories.slice(0,10)){
  const line=`• ${memory.label}: ${memory.text}\n`;
  if(reply.length+line.length>3500){reply+="Há mais informações. Diga o assunto que quer consultar.";return reply.trim();}
  reply+=line;
 }
 if(memories.length>10)reply+="Mostrei as dez primeiras. Diga um assunto para buscar outras.";
 return reply.trim();
}
export function explicitPersonalMemoryRequest(text:string,action:string){
 const s=normalize(text),verbs=action==="forget_personal"?"apaga|apague|apagar|esquece|esqueca|esquecer|remove|remova|remover":action==="update_personal"?"corrige|corrija|corrigir|atualiza|atualize|atualizar|troca|troque|muda|mude":"guarda|guarde|guardar|memoriza|memorize|memorizar|anota|anote|anotar|salva|salve|salvar|registra|registre|registrar|lembre|lembra";
 if(new RegExp(`\\b(?:nao|nunca)\\s+(?:(?:quero|precisa|deve|pode)\\s+)?(?:que\\s+)?(?:voce\\s+)?(?:${verbs})\\b`).test(s))return false;
 return new RegExp(`\\b(?:${verbs})\\b`).test(s);
}
export async function executePersonalMemory(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,source:{id:string;text:string}){
 if(intent.action==="recall_personal")return personalMemoryReply(await findPersonalMemories(tx,phone,phoneNumberId,intent.search || ""));
 if(["remember_personal","update_personal"].includes(intent.action) && !await personalMemoryConsent(tx,phone,phoneNumberId))return memoryDisclosure(phone,phoneNumberId,tx,source.id);
 if(!explicitPersonalMemoryRequest(source.text,intent.action))return "Quer que eu guarde ou altere essa informação na sua memória pessoal?";
 // Lock the owner before lookup/write, so two requests cannot create two copies
 // of the same label. The caller commits memory, interpretation and reply together.
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 const origin=await tx.incomingMessage.findFirst({where:{id:source.id,phone,phoneNumberId},select:{id:true}});
 if(!origin)throw Error("Origem de memória incompatível.");
 if(intent.action==="remember_personal"){
  const label=intent.title?.trim(),text=intent.description?.trim(),kind=intent.memoryKind;
  if(!label || !text || !kind)return "O que você quer que eu guarde sobre sua rotina, preferências ou pessoas importantes?";
  if(label.length>80 || text.length>500)return "Pode resumir essa informação para eu guardar com clareza?";
  const matches=await tx.event.findMany({where:{AND:[scope(phone,phoneNumberId),{payload:{path:["labelKey"],equals:normalize(label)}},{payload:{path:["kind"],equals:kind}}]},take:2});
  if(matches.length){const existing=decode(matches[0]);return existing?.text===text?"Essa informação já está guardada.":"Já existe uma memória com esse assunto. Peça para atualizar e diga qual informação deve ficar.";}
  await tx.event.create({data:{userId:user.id,type:"personal_memory",source:"secretaria",payload:{phoneNumberId,kind,label,labelKey:normalize(label),text,searchText:normalize(label+" "+text),version:0,sourceMessageId:source.id,updatedAt:new Date().toISOString()}}});
  return `Vou considerar isso nas nossas conversas: ${text}. Isso não cria lembretes automaticamente.`;
 }
 if(!intent.memoryId && !intent.search?.trim())return "Qual informação da sua memória pessoal você quer alterar?";
 const candidates=intent.memoryId?await tx.event.findMany({where:{...scope(phone,phoneNumberId),id:intent.memoryId},take:1}):await findPersonalMemories(tx,phone,phoneNumberId,intent.search!);
 if(!candidates.length)return "Não encontrei essa informação na sua memória pessoal.";
 if(candidates.length>1)return "Encontrei mais de uma informação. Qual assunto você quer alterar?";
 const id=candidates[0].id;
 await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${id} FOR UPDATE`;
 const row=await tx.event.findFirst({where:{...scope(phone,phoneNumberId),id}}),memory=row && decode(row);
 if(!memory)return "Essa memória mudou. Consulte a informação atual antes de alterar.";
 if(intent.expectedVersion!==undefined && intent.expectedVersion!==memory.version)return "Essa memória foi atualizada. Consulte a informação atual antes de alterar.";
 if(intent.action==="forget_personal"){
  await tx.event.delete({where:{id}});
  return "Removi essa informação da sua memória pessoal. As mensagens originais continuam no histórico; APAGAR MEUS DADOS inicia a limpeza completa deste contato nesta conta.";
 }
 const text=intent.description?.trim();
 if(!text || text.length>500)return "Qual informação deve ficar no lugar da anterior? Use até 500 caracteres.";
 const payload=row.payload as Record<string,Prisma.JsonValue>;
 await tx.event.update({where:{id},data:{payload:{...payload,text,searchText:normalize(memory.label+" "+text),version:memory.version+1,sourceMessageId:source.id,updatedAt:new Date().toISOString()}}});
 return `Atualizei sua memória pessoal: ${text}.`;
}
