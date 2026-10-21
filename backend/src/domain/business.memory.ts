import type { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { findNotes, notesReply } from "./notes";

export const normalizeName = (s:string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const label=(key:string)=>key==="orcamento"?"Orçamento":key.replace(/_/g," ");
function factKey(s:string) {
  const key=normalizeName(s).replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  return ["budget","valor","valor_orcamento","preco","orcamento"].includes(key) ? "orcamento" : key;
}
export async function resolveSubject(tx:Prisma.TransactionClient,phone:string,phoneNumberId:string,name:string,kind="client") {
  const scope={user:{phone},phoneNumberId,kind};
  const normalizedName=normalizeName(name);
  const exact=await tx.businessSubject.findFirst({where:{...scope,normalizedName}});
  if(exact)return {subject:exact,ambiguous:false};
  const matches=await tx.businessSubject.findMany({where:{...scope,normalizedName:{contains:normalizedName}},take:2});
  // A partial name can retrieve one record, but never silently updates it.
  return {subject:null,ambiguous:matches.length>0,matches};
}
export async function executeFact(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,sourceMessageId:string) {
  const name=intent.subject?.trim();
  if(!name || name.length>120)return "Qual é o nome do cliente ou projeto?";
  const kind=intent.subjectKind || "client", key=intent.factKey ? factKey(intent.factKey) : null;
  if(intent.factKey && (!key || key.length>80))return "Qual informação você quer guardar ou consultar?";
  const resolved=await resolveSubject(tx,phone,phoneNumberId,name,kind);
  if(resolved.ambiguous)return "Preciso do nome completo do cliente ou projeto para não confundir os registros.";
  if(intent.action==="search_facts") {
    if(!resolved.subject){
      const notes=await findNotes(tx,phone,phoneNumberId,name);
      return notes.length ? notesReply(notes) : "Não encontrei esse cliente ou projeto nos seus registros.";
    }
    const rows=await tx.knowledgeFact.findMany({where:{subjectId:resolved.subject.id,...(key?{key}:{}),...(intent.includeHistory?{}:{supersededAt:null})},orderBy:[{createdAt:"desc"},{revision:"desc"}],take:16});
    if(!rows.length)return "Não encontrei essa informação no cadastro de "+resolved.subject.name+".";
    let reply=resolved.subject.name+":\n",shown=0;
    for(const r of rows.slice(0,15)){
      const line=`• ${label(r.key)}: ${r.value}${intent.includeHistory ? ` (${r.supersededAt?"anterior":"atual"})` : ""}\n`;
      if(reply.length+line.length>3500)break;reply+=line;shown++;
    }
    return reply.trim()+(shown<rows.length?"\nHá mais registros; consulte uma informação específica.":"");
  }
  const value=intent.factValue?.trim();
  if(!key || !value)return "Qual informação e valor você quer guardar para "+name+"?";
  if(value.length>180)return "Pode resumir esse dado em até 180 caracteres? Para textos maiores, peça uma anotação.";
  const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
  const source=await tx.incomingMessage.findFirst({where:{id:sourceMessageId,phone,phoneNumberId}});
  if(!source)throw Error("Origem incompatível.");
  const replay=await tx.knowledgeFact.findUnique({where:{sourceMessageId}});
  if(replay)return "Essa informação já foi registrada.";
  const subject=await tx.businessSubject.upsert({where:{userId_phoneNumberId_kind_normalizedName:{userId:user.id,phoneNumberId,kind,normalizedName:normalizeName(name)}},create:{userId:user.id,phoneNumberId,kind,name,normalizedName:normalizeName(name)},update:{updatedAt:new Date()}});
  const previous=await tx.knowledgeFact.findFirst({where:{subjectId:subject.id,key},orderBy:{revision:"desc"}});
  // The contact/subject locks above serialize comparisons with concurrent
  // updates. Repeating a value is confirmation, not a new historical change.
  if(previous && previous.supersededAt===null && previous.value===value)return `Já está anotado: ${subject.name} — ${label(key)}: ${value}.`;
  await tx.knowledgeFact.updateMany({where:{subjectId:subject.id,key,supersededAt:null},data:{supersededAt:new Date()}});
  await tx.knowledgeFact.create({data:{subjectId:subject.id,key,value,revision:(previous?.revision || 0)+1,sourceMessageId}});
  return `${previous?"Atualizei":"Anotei"}: ${subject.name} — ${label(key)}: ${value}.`;
}
