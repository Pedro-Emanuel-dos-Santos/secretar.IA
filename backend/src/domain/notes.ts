import type { Prisma, PrismaClient } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";

type NoteStore=Pick<PrismaClient,"event">;
const normalized=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function notesReply(notes:{text:string}[]){
 if(!notes.length)return "Não encontrei essa informação nas suas anotações.";
 let reply="Encontrei estas anotações:\n",shown=0;
 for(const note of notes){if(reply.length+note.text.length+4>3500)break;reply+="• "+note.text+"\n";shown++;}
 if(shown<notes.length)reply+="Há mais resultados. Diga um nome ou assunto mais específico para eu procurar.";
 return reply.trim();
}
export async function findNotes(store:NoteStore,phone:string,phoneNumberId:string,search="") {
  const words=normalized(search).split(/[^a-z0-9]+/).filter(w=>w && !["a","o","de","da","do","das","dos","com","para"].includes(w));
  const rows=await store.event.findMany({where:{type:"secretary_note",user:{phone},AND:[
    {payload:{path:["phoneNumberId"],equals:phoneNumberId}},
    ...words.map(word=>({payload:{path:["searchText"],string_contains:word}})),
  ]},orderBy:[{createdAt:"desc"},{id:"desc"}],take:10});
  return rows.flatMap(row=>{
    const payload=row.payload as Record<string,unknown>;
    if(typeof payload.text!=="string")return [];
    if(!words.every(word=>normalized(payload.text as string).includes(word)))return [];
    return [{id:row.id,text:payload.text,version:Number.isSafeInteger(payload.version)?Number(payload.version):0,createdAt:row.createdAt.toISOString()}];
  }).slice(0,10);
}
export async function executeNote(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient) {
  if(intent.action==="search_notes") {
    const notes=await findNotes(tx,phone,phoneNumberId,intent.search?.trim() || "");
    return notesReply(notes);
  }
  if(intent.action==="edit_note" || intent.action==="delete_note"){
    if(!intent.noteId && !intent.search?.trim())return "Qual anotação você quer "+(intent.action==="delete_note"?"apagar?":"corrigir?");
    const candidates=intent.noteId ? await tx.event.findMany({where:{id:intent.noteId,type:"secretary_note",user:{phone},payload:{path:["phoneNumberId"],equals:phoneNumberId}},take:1}) : await findNotes(tx,phone,phoneNumberId,intent.search!.trim());
    if(!candidates.length)return "Não encontrei essa anotação nos seus registros.";
    if(candidates.length>1)return "Encontrei mais de uma. Qual você quer alterar?\n"+candidates.slice(0,5).map((n:any,i)=>`${i+1}. ${(n.text || n.payload?.text || "").slice(0,180)}`).join("\n");
    const id=candidates[0].id;
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${id} FOR UPDATE`;
    const target=await tx.event.findFirst({where:{id,type:"secretary_note",user:{phone},payload:{path:["phoneNumberId"],equals:phoneNumberId}}});
    if(!target)return "Essa anotação mudou enquanto eu processava. Consulte as anotações novamente.";
    const payload=target.payload as Record<string,unknown>,version=Number.isSafeInteger(payload.version)?Number(payload.version):0;
    if(intent.expectedVersion!==undefined && intent.expectedVersion!==version)return "Essa anotação foi alterada. Consulte a versão atual antes de corrigir ou apagar.";
    if(intent.action==="delete_note"){
      await tx.event.delete({where:{id}});
      await tx.event.create({data:{userId:target.userId,type:"note_deleted",source:"secretaria",payload:{phoneNumberId,noteId:id,version}}});
      return "Apaguei essa anotação da sua memória. As mensagens originais da conversa continuam no histórico.";
    }
    const text=intent.description?.trim();
    if(!text)return "Qual deve ser o texto completo da anotação corrigida?";
    if(text.length>1500)return "Pode resumir a anotação em até 1.500 caracteres?";
    await tx.event.update({where:{id},data:{payload:{phoneNumberId,text,searchText:normalized(text),version:version+1}}});
    return "Anotação corrigida: "+text;
  }
  const text=intent.description?.trim() || intent.title?.trim();
  if(!text)return "O que você quer que eu anote?";
  if(text.length>1500)return "Pode dividir essa anotação em partes menores? Cada uma pode ter até 1.500 caracteres.";
  const user=await tx.user.upsert({where:{phone},create:{phone},update:{}});
  await tx.event.create({data:{userId:user.id,type:"secretary_note",source:"secretaria",payload:{phoneNumberId,text,searchText:normalized(text),version:0}}});
  return "Anotei: "+text;
}
