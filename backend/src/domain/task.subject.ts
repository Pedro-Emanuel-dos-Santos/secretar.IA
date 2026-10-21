import type { Prisma } from "@prisma/client";
export class TaskSubjectError extends Error {
 constructor(public readonly reply:string){super("Vínculo de tarefa inválido.");}
}
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
export async function taskSubject(tx:Prisma.TransactionClient,userId:string,phoneNumberId:string,name?:string,kind="client"){
 if(name===undefined)return null;
 if(typeof name!=="string" || !name.trim() || name.trim().length>120 || !["client","project"].includes(kind))throw new TaskSubjectError("Qual é o nome completo do cliente ou projeto dessa tarefa?");
 const normalizedName=normalize(name);
 const scope={userId,phoneNumberId,kind};
 const existing=await tx.businessSubject.findUnique({where:{userId_phoneNumberId_kind_normalizedName:{...scope,normalizedName}}});
 if(existing)return existing;
 const partial=await tx.businessSubject.findFirst({where:{...scope,normalizedName:{contains:normalizedName}},select:{id:true}});
 if(partial)throw new TaskSubjectError("Encontrei um cadastro com nome parecido. Qual é o nome completo do cliente ou projeto? Não criei a tarefa.");
 return tx.businessSubject.upsert({where:{userId_phoneNumberId_kind_normalizedName:{...scope,normalizedName}},create:{...scope,name:name.trim(),normalizedName},update:{}});
}
