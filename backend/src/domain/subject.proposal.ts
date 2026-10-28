import type { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { normalizeName,resolveSubject,executeFact,factKey } from "./business.memory";
import { executeSubjectPending,pendingLine } from "./subject.pending";
import { mentionsName } from "./conversation.references";
import { parseInterpretation } from "./interpretation.validation";

export const subjectProposalActions=new Set(["propose_subject_update","confirm_subject_update","discard_subject_update"]);
export function subjectProposalCommand(text:string):AIInterpretation|null{
 const s=normalizeName(text).replace(/[.!]+$/,"").trim();
 const action=/^(?:confirmar atualizacao|confirmo a atualizacao|pode registrar a atualizacao)$/.test(s)?"confirm_subject_update":/^(?:descartar atualizacao|descarto a atualizacao)$/.test(s)?"discard_subject_update":null;
 return action?{action,reply:"Vou conferir a proposta.",title:null,description:null,datetime:null,amount:null,category:null}:null;
}
function preview(request:AIInterpretation){
 if(request.search)return `Proposta para ${request.subject}:\n• Informação: ${request.factKey}: ${request.factValue}\nAtualizar pendência existente:\n${pendingLine({title:request.search,state:request.pendingState || "pending",waitingFor:request.waitingFor || null,nextAction:request.nextAction || null})}\nAinda não alterei o projeto. Para aplicar as duas partes, envie CONFIRMAR ATUALIZAÇÃO. Para descartar, envie DESCARTAR ATUALIZAÇÃO. Vale por 15 minutos, enquanto esta for a última proposta respondida. Nenhum aviso será criado ou alterado.`;
 return `Proposta para ${request.subject}:\n• Informação: ${request.factKey}: ${request.factValue}\n• Nova pendência: ${request.title}${request.waitingFor?`\n• Aguardando: ${request.waitingFor}`:""}${request.nextAction?`\n• Próxima ação: ${request.nextAction}`:""}\nSem prazo e sem aviso agendado. Ainda não alterei o projeto. Para aplicar as duas partes, envie CONFIRMAR ATUALIZAÇÃO. Para descartar, envie DESCARTAR ATUALIZAÇÃO. Vale por 15 minutos, enquanto esta for a última proposta respondida.`;
}
const stale="A proposta expirou, foi substituída ou não teve envio confirmado. Peça uma nova proposta antes de confirmar.";
export async function executeSubjectProposal(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,sourceMessageId:string){
 const source=await tx.incomingMessage.findFirst({where:{id:sourceMessageId,phone,phoneNumberId}});
 if(!source)throw Error("Origem incompatível.");
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 if(intent.action==="propose_subject_update"){
  const existing=await tx.event.findUnique({where:{id:`subject_proposal:${sourceMessageId}`}});
  if(existing){const saved=existing.payload as any;return saved.status==="pending"?preview(parseInterpretation(JSON.stringify(saved.request))):"Essa proposta já foi encerrada. Peça outra se quiser uma nova atualização.";}
  if(!intent.subject || !mentionsName(source.text,intent.subject))return "Qual é o nome completo do cliente ou projeto que você quer atualizar?";
  const resolved=await resolveSubject(tx,phone,phoneNumberId,intent.subject,intent.subjectKind || "project");
  if(!resolved.subject)return "Não encontrei esse cadastro pelo nome exato. Informe um cliente ou projeto já registrado.";
  const pendingTitle=(intent.search || intent.title)?.trim();
  if(intent.subject.length>120 || !intent.factKey || !intent.factValue?.trim() || intent.factValue.trim().length>180 || !pendingTitle || pendingTitle.length>200)return "Preciso da informação a atualizar e do título da pendência. A informação deve ter até 180 caracteres e o título até 200.";
  const key=factKey(intent.factKey);if(!key || key.length>80)return "Qual informação do projeto você quer atualizar?";
  const text=normalizeName(source.text);
  if(/\b(?:nao|nunca|sem)\s+(?:registra|registre|registrar|atualiza|atualize|atualizar|cria|crie|criar|salva|salve|salvar|conclui|conclua|concluir|finaliza|finalize|finalizar|cancela|cancele|cancelar|retoma|retome|retomar)\b/.test(text))return "O pedido restringe uma das alterações. Não preparei a atualização conjunta; vamos esclarecer qual parte você quer registrar.";
  if(intent.datetime || /\b(?:avisa|avise|avisar|lembra|lembre|lembrar|notifica|notifique|amanha|hoje|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\d{1,2}[/:]\d{1,2}|\d{1,2}h\b/.test(text))return "Este pedido inclui prazo ou aviso. Vamos esclarecer essa parte antes de propor a atualização; ainda não alterei o projeto.";
  if(!intent.search && intent.pendingState && !["pending","waiting"].includes(intent.pendingState))return "Uma nova pendência precisa começar pendente ou aguardando. Conclusões de itens existentes são outra atualização.";
  const matches=intent.search?await tx.subjectPending.findMany({where:{userId:user.id,phoneNumberId,subjectId:resolved.subject.id,normalizedTitle:normalizeName(pendingTitle),state:{in:["pending","waiting"]}},take:2}):[];
  if(intent.search && matches.length!==1)return "Preciso identificar uma única pendência aberta nesse projeto. Informe o título exato; ainda não alterei nada.";
  const target=matches[0];
  if(intent.waitingFor && intent.waitingFor!==target?.waitingFor && !mentionsName(source.text,intent.waitingFor))return "Quem ou o que você está aguardando? Não vou atribuir um interlocutor que não foi informado.";
  const priorState=target?.state==="waiting"?"waiting":"pending";
  const state=intent.pendingState || (intent.waitingFor?"waiting":priorState);
  const waitingFor=state==="waiting"?intent.waitingFor || target?.waitingFor:null;
  const preservesWaiting=target?.state==="waiting" && waitingFor===target.waitingFor;
  if(state==="waiting" && (!waitingFor || !preservesWaiting && !/\b(?:aguardando|aguardar|esperando|depende|dependente)\b/.test(text)) || state!=="waiting" && intent.waitingFor)return "Você quer registrar a pendência como aguardando quem ou o quê?";
  if(state==="completed" && !/\b(?:conclui|concluir|conclua|concluido|concluida|finaliza|finalizar|finalize|finalizado|finalizada|resolvido|resolvida)\b/.test(text))return "Quer também concluir a pendência? A informação nova, sozinha, não indica que o acompanhamento terminou. Ainda não alterei nada.";
  if(state==="cancelled" && !/\b(?:cancela|cancele|cancelar|cancelado|cancelada)\b/.test(text))return "Quer também cancelar a pendência? Preciso desse pedido explícito antes de preparar a atualização.";
  const subject=resolved.subject;
  if(!target && await tx.subjectPending.count({where:{userId:user.id,phoneNumberId,subjectId:subject.id,normalizedTitle:normalizeName(pendingTitle),state:{in:["pending","waiting"]}}}))return "Já existe uma pendência aberta com esse título no projeto. Consulte ou atualize a existente; não criei outra.";
  const current=await tx.knowledgeFact.findFirst({where:{subjectId:subject.id,key,supersededAt:null},orderBy:{revision:"desc"}});
  const request:AIInterpretation={action:"propose_subject_update",subject:subject.name,subjectKind:subject.kind==="project"?"project":"client",factKey:key,factValue:intent.factValue.trim(),title:pendingTitle,description:null,datetime:null,amount:null,category:null,reply:"interno",pendingState:state,...(target?{search:target.title,expectedVersion:target.version}:{}),waitingFor,nextAction:["completed","cancelled"].includes(state)?null:intent.nextAction ?? target?.nextAction ?? null};
  await tx.event.create({data:{id:`subject_proposal:${sourceMessageId}`,userId:user.id,type:"subject_update_proposal",source:"secretaria",payload:JSON.parse(JSON.stringify({phoneNumberId,sourceMessageId,subjectId:subject.id,status:"pending",request,expectedPending:target?{id:target.id,version:target.version}:null,expectedFact:current?{id:current.id,revision:current.revision}:null,expiresAt:new Date(Date.now()+15*60000).toISOString()}))}});
  return preview(request);
 }
 if(source.mediaId || subjectProposalCommand(source.text)?.action!==intent.action)return "Para aplicar uma proposta, envie CONFIRMAR ATUALIZAÇÃO por texto. Não alterei o projeto.";
 const replay=await tx.event.findFirst({where:{userId:user.id,type:"subject_update_proposal",payload:{path:["confirmationMessageId"],equals:sourceMessageId}}});
 if(replay)return "Essa confirmação já foi processada. Não repeti a atualização.";
 const event=await tx.event.findFirst({where:{userId:user.id,type:"subject_update_proposal",payload:{path:["phoneNumberId"],equals:phoneNumberId}},orderBy:[{createdAt:"desc"},{id:"desc"}]});
 if(!event)return stale;
 const payload=event.payload as any;
 const now=Math.max(Date.now(),source.receivedAt.getTime());
 if(payload.status!=="pending" || typeof payload.expiresAt!=="string" || !Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt)<=now)return stale;
 const latest=await tx.incomingMessage.findFirst({where:{phone,phoneNumberId,reply:{status:"provider_accepted",finishedAt:{lte:source.receivedAt}}},orderBy:[{reply:{finishedAt:"desc"}},{id:"desc"}],select:{id:true}});
 if(latest?.id!==payload.sourceMessageId)return stale;
 const origin=await tx.incomingMessage.findFirst({where:{id:payload.sourceMessageId,phone,phoneNumberId}});
 if(!origin)return stale;
 if(intent.action==="discard_subject_update"){
  await tx.event.update({where:{id:event.id},data:{payload:{...payload,status:"discarded",confirmationMessageId:sourceMessageId}}});return "Descartei a proposta. Não alterei a informação do projeto nem criei a pendência.";
 }
 const request=parseInterpretation(JSON.stringify(payload.request));
 const subject=await tx.businessSubject.findFirst({where:{id:payload.subjectId,userId:user.id,phoneNumberId,name:request.subject || undefined}});
 if(!subject || !request.factKey || !request.factValue || !request.title)return stale;
 const current=await tx.knowledgeFact.findFirst({where:{subjectId:subject.id,key:request.factKey,supersededAt:null},orderBy:{revision:"desc"}});
 const expected=payload.expectedFact;
 if(expected?(current?.id!==expected.id || current?.revision!==expected.revision):!!current)return "Essa informação mudou depois da proposta. Não apliquei nada; peça uma nova proposta com a posição atual.";
 const target=payload.expectedPending?await tx.subjectPending.findFirst({where:{id:payload.expectedPending.id,userId:user.id,phoneNumberId,subjectId:subject.id,version:payload.expectedPending.version,state:{in:["pending","waiting"]}}}):null;
 if(request.search && (!target || target.title!==request.search || target.version!==request.expectedVersion))return "Essa pendência mudou depois da proposta. Não apliquei nada; peça uma nova proposta com a posição atual.";
 if(!request.search && await tx.subjectPending.count({where:{userId:user.id,phoneNumberId,subjectId:subject.id,normalizedTitle:normalizeName(request.title),state:{in:["pending","waiting"]}}}))return "Uma pendência com esse título já foi registrada depois da proposta. Não apliquei nada; consulte a posição atual.";
 // Savepoint keeps controlled domain refusals from committing just one half.
 // Any unexpected DB error is rethrown so the enclosing inbox transaction retries.
 await tx.$executeRawUnsafe("SAVEPOINT subject_proposal_apply");
 try{
  const factReply=await executeFact(phone,phoneNumberId,{...request,action:"save_fact"},tx,origin.id);
  const pendingIntent:AIInterpretation={...request,action:target?"update_subject_pending":"create_subject_pending"};delete pendingIntent.factKey;delete pendingIntent.factValue;
  const pendingReply=await executeSubjectPending(phone,phoneNumberId,pendingIntent,tx,origin.id,"confirmed_proposal");
  const fact=await tx.knowledgeFact.findFirst({where:{subjectId:subject.id,key:request.factKey,value:request.factValue,supersededAt:null}});
  const pending=await tx.subjectPending.findUnique({where:target?{id:target.id}:{sourceMessageId:origin.id}});
  const pendingApplied=!!pending && pending.subjectId===subject.id && (!target || pending.state===request.pendingState && pending.waitingFor===(request.waitingFor ?? null) && pending.nextAction===(request.nextAction ?? null));
  if(!fact || !pendingApplied){
   await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT subject_proposal_apply");await tx.$executeRawUnsafe("RELEASE SAVEPOINT subject_proposal_apply");
   return `Não apliquei nenhuma das duas partes. ${!pendingApplied?pendingReply:factReply}`;
  }
  await tx.event.update({where:{id:event.id},data:{payload:{...payload,status:"applied",confirmationMessageId:sourceMessageId,factId:fact.id,pendingId:pending!.id,pendingVersion:pending!.version}}});
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT subject_proposal_apply");
  return `Atualização confirmada em ${subject.name}:\n• ${request.factKey}: ${request.factValue}\n${pendingLine(pending!)}\nAs duas partes foram registradas. Nenhum aviso foi criado ou alterado.`;
 }catch(error){throw error;}
}
