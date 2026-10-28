import type { PrismaClient } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { normalizeName } from "./business.memory";
import { parseInterpretation } from "./interpretation.validation";
import { mentionsName } from "./conversation.references";

type Store=Pick<PrismaClient,"incomingMessage"|"event"|"subjectPending"|"businessSubject">;
type Message={id?:string;phone:string;phoneNumberId:string;text:string;receivedAt:Date};
type Request={state:"waiting"|"pending"|"completed";person?:string;nextAction:string|null};
export function continuationRequest(text:string):Request|null{
 const body=text.trim().replace(/[.!]+$/,"").trim(),s=normalizeName(body);
 if(/[?\n]|\b(?:nao|nunca|talvez|se|amanha|hoje|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|avisa|avise|lembra|lembre)\b|\d/.test(s))return null;
 if(/^(?:(?:ja (?:assinou|terminei|conclui|resolvi)|resolvido|resolvida)[,; ]+)?(?:pode concluir|pode finalizar|pode dar como concluida|conclua|conclui|finaliza|finalize)(?: (?:essa|esta|a) pendencia)?$/.test(s))return {state:"completed",nextAction:null};
 const waiting=body.match(/^(?:(?:j[aá] )?(?:revisei|enviei|conferi|preparei|terminei)(?:\s+[^,;.]{1,150}?)?[,;.]?\s+)?agora\s+(?:(?:s[oó]\s+)?falta\s+)(.+?)\s+([\p{L}]+r\b.+|[\p{L}]+r)$/iu);
 if(waiting){const person=waiting[1].trim(),nextAction=waiting[2].trim();if(person.length<=120 && nextAction.length<=300 && !/\b(?:e|depois|tambem)\b/.test(normalizeName(nextAction)))return {state:"waiting",person,nextAction};}
 const explicit=body.match(/^(?:agora\s+)?(?:estou\s+|estamos\s+|fica\s+)?(?:aguardando|esperando)\s+(.+?)$/iu);
 if(explicit && explicit[1].length<=120 && !/[,;:]|\b(?:e|para|pra|depois|tambem)\b/.test(normalizeName(explicit[1])))return {state:"waiting",person:explicit[1].trim(),nextAction:null};
 const next=body.match(/^agora\s+(?:vou|preciso(?: de)?|vamos)\s+([\p{L}]+r\b.*)$/iu);
 if(next && next[1].length<=300 && !/[,;:]|\b(?:e|depois|tambem)\b/.test(normalizeName(next[1])))return {state:"pending",nextAction:next[1].trim()};
 return null;
}

export type PendingContinuation={intent:AIInterpretation;person:string|null;reason?:string};
export async function pendingContinuation(store:Store,message:Message):Promise<PendingContinuation|null>{
 const request=continuationRequest(message.text);if(!request)return null;
 const base={action:"conversation" as const,title:null,description:null,datetime:null,amount:null,category:null,reply:"De qual pendência você está falando? Pode dizer o projeto e o título para eu continuar no assunto certo."};
 const clarify=(reply=base.reply):PendingContinuation=>({intent:{...base,reply},person:null,reason:reply});
 const history=await store.incomingMessage.findMany({where:{phone:message.phone,phoneNumberId:message.phoneNumberId,...(message.id?{id:{not:message.id}}:{}),receivedAt:{gte:new Date(message.receivedAt.getTime()-30*60000),lte:message.receivedAt},status:{in:["completed","reply_pending","reply_sending","reply_unknown"]}},orderBy:[{receivedAt:"desc"},{id:"desc"}],take:20,select:{id:true,receivedAt:true,text:true,interpretation:true,reply:{select:{status:true,finishedAt:true}}}});
 let readSubject:string|null=null;
 let readAt:Date|null=null;
 for(const row of history){
  let intent;try{intent=parseInterpretation(JSON.stringify(row.interpretation));}catch{return clarify();}
  if(intent.action==="conversation")continue;
  if(row.reply?.status!=="provider_accepted" || !row.reply.finishedAt || row.reply.finishedAt>message.receivedAt)return clarify();
  if(["search_facts","subject_overview","list_subject_pendings"].includes(intent.action)){
   if(!intent.subject)return clarify();
   const subject=await store.businessSubject.findFirst({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,normalizedName:normalizeName(intent.subject),kind:intent.subjectKind || "client"}});
   if(!subject || readSubject && readSubject!==subject.id)return clarify();readSubject=subject.id;
   if(!readAt && !intent.search && !intent.taskFilter && !intent.includeHistory && ["subject_overview","list_subject_pendings"].includes(intent.action))readAt=row.receivedAt;
   continue;
  }
  if(!["create_subject_pending","update_subject_pending","confirm_subject_update"].includes(intent.action))return clarify();
  const confirmed=intent.action==="confirm_subject_update";
  const event=await store.event.findFirst({where:{user:{phone:message.phone},type:confirmed?"subject_update_proposal":{in:["subject_pending_created","subject_pending_updated","subject_pending_focused"]},AND:[{payload:{path:["phoneNumberId"],equals:message.phoneNumberId}},{payload:{path:[confirmed?"confirmationMessageId":"sourceMessageId"],equals:row.id}},...(confirmed?[{payload:{path:["status"],equals:"applied"}}]:[])]},orderBy:{createdAt:"desc"}});
  const payload=event?.payload as any,data=confirmed && payload?{...payload,version:payload.pendingVersion ?? 0,waitingFor:payload.request?.waitingFor}:payload;if(typeof data?.pendingId!=="string")return clarify();
  const pending=await store.subjectPending.findFirst({where:{id:data.pendingId,user:{phone:message.phone},phoneNumberId:message.phoneNumberId},include:{subject:true}});
  if(!pending || readSubject && readSubject!==pending.subjectId)return clarify();
  if(!["pending","waiting"].includes(pending.state))return clarify("Essa pendência já foi encerrada. Se você quer tratar outra, diga qual é.");
  if(pending.version!==data.version)return clarify("Essa pendência mudou depois da nossa conversa. Consulte a posição atual antes de continuar.");
  // A name in the new message cannot silently switch to a different project.
  const subjects=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{id:true,name:true},take:101});
  if(subjects.length>100 || subjects.some(s=>s.id!==pending.subjectId && mentionsName(message.text,s.name)))return clarify();
  let person=request.person?.replace(/^(?:o|a)\s+/iu,"") || null;
  const previousPerson=typeof data.conversationPerson==="string"?data.conversationPerson:typeof data.waitingFor==="string"?data.waitingFor:typeof data.previous?.waitingFor==="string"?data.previous.waitingFor:null;
  if(person && /^(?:ele|ela)$/.test(normalizeName(person))){if(!previousPerson || /[,/]|\b(?:e|ou)\b/.test(normalizeName(previousPerson)))return clarify("Quem está faltando responder ou agir nessa pendência?");person=previousPerson;}
  return {person:person || previousPerson,intent:{...base,action:"update_subject_pending",subject:pending.subject.name,subjectKind:pending.subject.kind==="project"?"project":"client",search:pending.title,subjectPendingId:pending.id,expectedVersion:pending.version,pendingState:request.state,waitingFor:request.state==="waiting"?person:null,nextAction:request.nextAction,reply:"Vou atualizar o andamento dessa pendência."}};
 }
 if(readSubject && readAt){
  const rows=await store.subjectPending.findMany({where:{subjectId:readSubject,user:{phone:message.phone},phoneNumberId:message.phoneNumberId,state:{in:["pending","waiting"]}},include:{subject:true},take:2});
  if(rows.length!==1)return clarify(rows.length>1?"Esse assunto tem mais de uma pendência. Qual delas você quer atualizar?":base.reply);
  const pending=rows[0];
  if(pending.updatedAt>readAt)return clarify("Essa pendência mudou depois da consulta. Vamos conferir a posição atual antes de continuar.");
  const subjects=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{id:true,name:true},take:101});
  if(subjects.length>100 || subjects.some(s=>s.id!==pending.subjectId && mentionsName(message.text,s.name)))return clarify();
  let person=request.person?.replace(/^(?:o|a)\s+/iu,"") || null;
  if(person && /^(?:ele|ela)$/.test(normalizeName(person))){
   if(!pending.waitingFor || /[,/]|\b(?:e|ou)\b/.test(normalizeName(pending.waitingFor)))return clarify("Quem está faltando responder ou agir nessa pendência?");
   person=pending.waitingFor;
  }
  return {person:person || pending.waitingFor,intent:{...base,action:"update_subject_pending",subject:pending.subject.name,subjectKind:pending.subject.kind==="project"?"project":"client",search:pending.title,subjectPendingId:pending.id,expectedVersion:pending.version,pendingState:request.state,waitingFor:request.state==="waiting"?person:null,nextAction:request.nextAction,reply:"Vou atualizar o andamento dessa pendência."}};
 }
 return clarify();
}
