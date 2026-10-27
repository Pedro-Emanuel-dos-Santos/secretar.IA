import type { PrismaClient } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import {normalizeName} from "./business.memory";
import {mentionsName} from "./conversation.references";
import {parseInterpretation} from "./interpretation.validation";
type Store=Pick<PrismaClient,"incomingMessage"|"event"|"businessSubject"|"subjectPending">;
type Subject={id:string;name:string;kind:string};
type Candidate={id:string;title:string;version:number;waitingFor:string|null;state:string};
export type PendingFollowup={recognized:true;nextAction:string|null;subject:Subject|null;candidates:Candidate[];reason?:string};

// Extract only a literal next action; do not infer signature, completion or a date.
export function pendingResponse(text:string):{person:string;nextAction:string;subjectName?:string;subjectKind?:"client"|"project"}|null{
 const s=normalizeName(text);
 if(/[?]|\b(?:nao|nunca|talvez|se)\b/.test(s))return null;
 const prefix=text.trim().match(/^(?:no|na|do|da)\s+(projeto|cliente)\s+(.+?)[,;:]\s*/iu);
 const body=prefix?text.trim().slice(prefix[0].length):text.trim();
 const match=body.match(/^(?:(?:o|a)\s+)?(.+?)\s+(?:j[aá]\s+)?(?:respondeu|retornou|deu retorno)\s*[,;.!]?\s*(?:e\s+)?agora\s+(?:falta|preciso(?:\s+de)?|precisamos|vou|vamos)\s+(.+?)\s*[.!]*$/iu);
 if(!match)return null;
 const person=normalizeName(match[1]),nextAction=match[2].trim().replace(/[.!]+$/,"").trim();
 if(person.length>120 || !/^[a-z]+r\b/.test(normalizeName(nextAction)) || nextAction.length>300)return null;
 if(/\b(?:amanha|hoje|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|avisa|avise|avisar|lembra|lembre|lembrar)\b|\d{1,2}[/:]\d{1,2}|\d{1,2}h\b/.test(s))return null;
 return {person,nextAction,...(prefix?{subjectName:prefix[2].trim(),subjectKind:normalizeName(prefix[1])==="projeto"?"project" as const:"client" as const}:{})};
}
export async function subjectFromPendingAudit(store:Pick<Store,"event"|"businessSubject">,phone:string,phoneNumberId:string,messageId:string,pendingId:string):Promise<Subject|null>{
 const event=await store.event.findFirst({where:{user:{phone},type:"subject_pending_updated",AND:[{payload:{path:["phoneNumberId"],equals:phoneNumberId}},{payload:{path:["sourceMessageId"],equals:messageId}},{payload:{path:["pendingId"],equals:pendingId}}]},orderBy:{createdAt:"desc"}});
 const subjectId=(event?.payload as {subjectId?:unknown}|null)?.subjectId;
 return typeof subjectId==="string"?store.businessSubject.findFirst({where:{id:subjectId,user:{phone},phoneNumberId},select:{id:true,name:true,kind:true}}):null;
}
export async function pendingFollowupContext(store:Store,message:{phone:string;phoneNumberId:string;text:string;receivedAt:Date;id?:string}):Promise<PendingFollowup|null>{
 if(!/\b(?:respondeu|retornou|deu retorno)\b.*\bagora\s+(?:falta|preciso|precisamos|vou|vamos)\b/i.test(normalizeName(message.text)))return null;
 const parsed=pendingResponse(message.text);
 if(!parsed)return {recognized:true,nextAction:null,subject:null,candidates:[],reason:"Você quer atualizar uma pendência? Diga qual assunto e a próxima ação, sem misturar prazo ou aviso."};
 const history=parsed.subjectName?[]:await store.incomingMessage.findMany({where:{phone:message.phone,phoneNumberId:message.phoneNumberId,...(message.id?{id:{not:message.id}}:{}),receivedAt:{gte:new Date(message.receivedAt.getTime()-30*60000),lte:message.receivedAt},status:{in:["completed","reply_pending","reply_sending","reply_unknown"]}},orderBy:[{receivedAt:"desc"},{id:"desc"}],take:20,select:{id:true,text:true,interpretation:true,reply:{select:{status:true,finishedAt:true}}}});
 let subject:Subject|null=null;
 if(parsed.subjectName){
  const explicit=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,normalizedName:normalizeName(parsed.subjectName),kind:parsed.subjectKind},select:{id:true,name:true,kind:true},take:2});
  if(explicit.length===1)subject=explicit[0];
 }
 for(const row of history){
  let intent;try{intent=parseInterpretation(JSON.stringify(row.interpretation));}catch{break;}
  if(intent.action==="conversation")continue;
  if(row.reply?.status!=="provider_accepted" || !row.reply.finishedAt || row.reply.finishedAt>message.receivedAt)break;
  if(intent.action==="update_subject_pending" && intent.subjectPendingId){subject=await subjectFromPendingAudit(store,message.phone,message.phoneNumberId,row.id,intent.subjectPendingId);break;}
  if(intent.action==="confirm_subject_update"){
   const event=await store.event.findFirst({where:{user:{phone:message.phone},type:"subject_update_proposal",AND:[{payload:{path:["phoneNumberId"],equals:message.phoneNumberId}},{payload:{path:["confirmationMessageId"],equals:row.id}},{payload:{path:["status"],equals:"applied"}}]},orderBy:{createdAt:"desc"}});
   const id=(event?.payload as {subjectId?:unknown}|null)?.subjectId;
   if(typeof id==="string")subject=await store.businessSubject.findFirst({where:{id,user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{id:true,name:true,kind:true}});
   break;
  }
  if(intent.subject){
   if(!mentionsName(row.text,intent.subject)){
    if(["subject_overview","search_facts","agenda_overview","list_subject_pendings"].includes(intent.action))continue;
    break;
   }
   const matches=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,normalizedName:normalizeName(intent.subject),kind:intent.subjectKind || "client"},select:{id:true,name:true,kind:true},take:2});
   const names=await store.businessSubject.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId},select:{id:true,name:true},orderBy:{id:"asc"},take:101});
   const named=names.filter(item=>mentionsName(row.text,item.name));
   if(matches.length===1 && names.length<=100 && named.length===1 && named[0].id===matches[0].id)subject=matches[0];break;
  }
  break;
 }
 if(!subject)return {recognized:true,nextAction:parsed.nextAction,subject:null,candidates:[],reason:"De qual projeto ou cliente é esse retorno? Consulte o assunto primeiro para eu retomar a pendência certa."};
 const rows=await store.subjectPending.findMany({where:{user:{phone:message.phone},phoneNumberId:message.phoneNumberId,subjectId:subject.id,state:"waiting"},select:{id:true,title:true,version:true,waitingFor:true,state:true},orderBy:{id:"asc"},take:101});
 const candidates=rows.length<=100?rows.filter(row=>row.waitingFor && normalizeName(row.waitingFor)===parsed.person):[];
 return {recognized:true,nextAction:parsed.nextAction,subject,candidates:candidates.slice(0,2),...(rows.length>100?{reason:"Há muitas pendências para resolver essa referência com segurança. Informe o título e o projeto."}:{})};
}
export function pendingFollowupIntent(context:PendingFollowup|null):AIInterpretation|null{
 if(!context)return null;
 const base={title:null,description:null,datetime:null,amount:null,category:null};
 if(context.reason || !context.subject || !context.nextAction || context.candidates.length!==1)return {...base,action:"conversation",reply:context.reason || (context.candidates.length>1?"Há mais de uma pendência desse assunto aguardando essa pessoa. Qual delas você quer atualizar?":"Não encontrei uma pendência desse assunto aguardando essa pessoa. Qual pendência você quer atualizar?")};
 const target=context.candidates[0];
 return {...base,action:"update_subject_pending",reply:"Vou conferir a pendência atual.",subject:context.subject.name,subjectKind:context.subject.kind==="project"?"project":"client",search:target.title,subjectPendingId:target.id,expectedVersion:target.version,pendingState:"pending",nextAction:context.nextAction};
}
