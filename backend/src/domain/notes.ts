import type { Prisma, PrismaClient } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";

type NoteStore=Pick<PrismaClient,"event">;
const normalized=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function notesReply(notes:{text:string}[]){
 if(!notes.length)return "Não encontrei essa informação nas suas anotações. Quer me contar para eu guardar?";
 let reply="Encontrei estas anotações:\n",shown=0;
 for(const note of notes){if(reply.length+note.text.length+4>3500)break;reply+="• "+note.text+"\n";shown++;}
 if(shown<notes.length)reply+="Há mais resultados. Diga um nome ou assunto mais específico para eu procurar.";
 return reply.trim();
}
export async function findNotes(store:NoteStore,phone:string,phoneNumberId:string,search="") {
  const words=normalized(search).split(/\s+/).filter(Boolean);
  const rows=await store.event.findMany({where:{type:"secretary_note",user:{phone},AND:[
    {payload:{path:["phoneNumberId"],equals:phoneNumberId}},
    ...words.map(word=>({payload:{path:["searchText"],string_contains:word}})),
  ]},orderBy:[{createdAt:"desc"},{id:"desc"}],take:10});
  return rows.flatMap(row=>{
    const payload=row.payload as Record<string,unknown>;
    if(typeof payload.text!=="string")return [];
    if(!words.every(word=>normalized(payload.text as string).includes(word)))return [];
    return [{id:row.id,text:payload.text,createdAt:row.createdAt.toISOString()}];
  }).slice(0,10);
}
export async function executeNote(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient) {
  if(intent.action==="search_notes") {
    const notes=await findNotes(tx,phone,phoneNumberId,intent.search?.trim() || "");
    return notesReply(notes);
  }
  const text=intent.description?.trim() || intent.title?.trim();
  if(!text)return "O que você quer que eu anote?";
  if(text.length>1500)return "Pode dividir essa anotação em partes menores? Cada uma pode ter até 1.500 caracteres.";
  const user=await tx.user.upsert({where:{phone},create:{phone},update:{}});
  await tx.event.create({data:{userId:user.id,type:"secretary_note",source:"secretaria",payload:{phoneNumberId,text,searchText:normalized(text)}}});
  return "Anotei: "+text+"\nPode me perguntar sobre isso depois. Não criei um aviso com horário.";
}
