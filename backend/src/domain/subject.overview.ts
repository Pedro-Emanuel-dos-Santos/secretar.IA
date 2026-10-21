import type { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { resolveSubject } from "./business.memory";
import { contactTimezone } from "./preferences";
import { findNotes } from "./notes";
import { mentionsName } from "./conversation.references";

export async function subjectOverview(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient){
 const name=intent.subject?.trim();
 if(!name)return "Qual cliente ou projeto você quer consultar?";
 const result=await resolveSubject(tx,phone,phoneNumberId,name,intent.subjectKind || "client");
 if(result.ambiguous)return "Qual é o nome completo do cliente ou projeto? Encontrei nomes parecidos.";
 if(!result.subject)return "Não encontrei esse cliente ou projeto no cadastro.";
 const subject=result.subject;
 const [facts,appointments,noteCandidates,timezone]=await Promise.all([
  tx.knowledgeFact.findMany({where:{subjectId:subject.id,supersededAt:null},orderBy:[{createdAt:"desc"},{id:"desc"}],take:9}),
  tx.appointment.findMany({where:{subjectId:subject.id,user:{phone},phoneNumberId,state:"active"},orderBy:[{startsAt:"asc"},{id:"asc"}],take:9}),
  findNotes(tx,phone,phoneNumberId,subject.name),contactTimezone(tx,phone,phoneNumberId),
 ]);
 const notes=noteCandidates.filter(note=>mentionsName(note.text,subject.name));
 const lines=[`Registros de ${subject.name}:`];
 if(facts.length){lines.push("Dados atuais:");for(const fact of facts.slice(0,8))lines.push(`• ${fact.key==="orcamento"?"Orçamento":fact.key.replace(/_/g," ")}: ${fact.value}`);}
 if(appointments.length){lines.push("Compromissos ativos:");for(const appointment of appointments.slice(0,8))lines.push(`• ${appointment.title.slice(0,160)} — ${new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(appointment.startsAt)}`);}
 if(notes.length){lines.push("Anotações que mencionam esse nome:");for(const note of notes.slice(0,3))lines.push(`• ${note.text.slice(0,240)}`);}
 if(!facts.length && !appointments.length && !notes.length)lines.push("O cadastro existe, mas não encontrei dados, compromissos ativos ou anotações com esse nome.");
 // Past active appointments stay visible: being in the past is not proof that
 // the visit happened. No title similarity is treated as a task association.
 let text="";let shown=0;
 for(const line of lines){if(text.length+line.length+1>3200)break;text+=(text?"\n":"")+line;shown++;}
 if(shown<lines.length || facts.length>8 || appointments.length>8 || notes.length>3)text+="\nHá mais registros. Consulte um dado ou período específico.";
 return text;
}
