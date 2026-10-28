import type { Prisma } from "@prisma/client";
import { factProvenance,factOriginSelection } from "./fact.provenance";

const labels:Record<string,string>={pending:"pendente",waiting:"aguardando",completed:"concluída",cancelled:"cancelada"};
function position(value:any){
 if(!value || typeof value!=="object" || !labels[value.state])return null;
 const waiting=typeof value.waitingFor==="string"?value.waitingFor:null;
 const next=typeof value.nextAction==="string"?value.nextAction:null;
 return labels[value.state]+(waiting?`; aguardando ${waiting}`:"")+(next?`; próxima ação: ${next}`:"");
}

// Read audit snapshots, never reconstruct past positions from conversation text.
// Both the record and the incoming source must belong to this contact/account.
export async function subjectPendingHistory(tx:Prisma.TransactionClient,phone:string,phoneNumberId:string,subjectId:string,timezone:string){
 const events=await tx.event.findMany({where:{user:{phone},type:"subject_pending_updated",AND:[{payload:{path:["phoneNumberId"],equals:phoneNumberId}},{payload:{path:["subjectId"],equals:subjectId}}]},orderBy:[{createdAt:"desc"},{id:"desc"}],take:16});
 if(!events.length)return "";
 const payloads=events.map(e=>e.payload as any);
 const ids=payloads.map(e=>e.pendingId).filter((v):v is string=>typeof v==="string");
 const sources=payloads.map(e=>e.sourceMessageId).filter((v):v is string=>typeof v==="string");
 const records=await tx.subjectPending.findMany({where:{id:{in:ids},subjectId,user:{phone},phoneNumberId}});
 const messages=await tx.incomingMessage.findMany({where:{id:{in:sources},phone,phoneNumberId},select:{id:true,...factOriginSelection}});
 let reply="Alterações de pendências (mais recentes primeiro):\n",shown=0;
 for(let i=0;i<events.length;i++){
  const event=events[i],data=payloads[i],row=records.find(r=>r.id===data.pendingId),source=messages.find(m=>m.id===data.sourceMessageId);
  const before=position(data.previous),after=position(data);
  if(!row || !source || !before || !after)continue;
  const current=position(row);
  const line=`• ${row.title}\n  Antes: ${before}.\n  Após essa alteração: ${after}.\n  Situação atual: ${current}.\n  ${factProvenance({createdAt:event.createdAt,sourceMessage:source},phone,phoneNumberId,timezone)}\n`;
  if(shown===3 || reply.length+line.length>1800)break;
  reply+=line;shown++;
 }
 if(!shown)return "";
 return reply.trim()+(shown<events.length?"\nA lista é parcial; há outros registros de alterações.":"");
}
