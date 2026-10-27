import type { Prisma,BusinessSubject } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { resolveSubject,normalizeName } from "./business.memory";
import { mentionsName } from "./conversation.references";

export const subjectPendingActions=new Set(["create_subject_pending","list_subject_pendings","update_subject_pending"]);
const open=["pending","waiting"];
const labels:Record<string,string>={pending:"pendente",waiting:"aguardando",completed:"concluída",cancelled:"cancelada"};
export function pendingLine(row:{title:string;state:string;nextAction:string|null;waitingFor:string|null}){
 return `• ${row.title} — ${labels[row.state] || row.state}${row.waitingFor?`; aguardando ${row.waitingFor}`:""}${row.nextAction?`\n  Próxima ação: ${row.nextAction}`:""}`;
}
export async function executeSubjectPending(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,sourceMessageId:string,authorization?:"confirmed_proposal"){
 const scope={user:{phone},phoneNumberId};
 const reading=intent.action==="list_subject_pendings";
 const source=await tx.incomingMessage.findFirst({where:{id:sourceMessageId,phone,phoneNumberId}});
 if(!source)throw Error("Origem incompatível.");
 const name=intent.subject?.trim();
 let subject:BusinessSubject|undefined;
 if(name){
  if(name.length>120)return "Qual é o nome completo do cliente ou projeto?";
  const found=await resolveSubject(tx,phone,phoneNumberId,name,intent.subjectKind || "project");
  if(!found.subject)return "Não encontrei esse cadastro pelo nome exato. Informe o cliente ou projeto já registrado.";
  subject=found.subject;
 }
 if(reading){
  const rows=await tx.subjectPending.findMany({where:{...scope,...(subject?{subjectId:subject.id}:{}),state:intent.pendingState || {in:open}},include:{subject:{select:{name:true}}},orderBy:[{updatedAt:"desc"},{id:"asc"}],take:11});
  if(!rows.length)return "Não encontrei pendências nesse filtro.";
  return `Pendências${subject?` de ${subject.name}`:" registradas"} (sem aviso agendado):\n`+rows.slice(0,10).map(r=>pendingLine(r)+(subject?"":`\n  Assunto: ${r.subject.name}`)).join("\n")+(rows.length>10?"\nHá mais itens; consulte um projeto específico.":"");
 }
 if(!subject || !mentionsName(source.text,subject.name))return "Diga o nome completo do cliente ou projeto na atualização para eu registrar no assunto certo.";
 const text=normalizeName(source.text);
 if(authorization!=="confirmed_proposal" && (/[?]|\b(?:nao|nunca|talvez|se)\b/.test(text) || /^(?:como|qual|quando|sera|o que)\b/.test(text)))return "Você quer consultar a pendência ou registrar uma alteração? Não alterei os registros.";
 if(intent.datetime || /\b(?:avisa|avise|avisar|lembra|lembre|lembrar|notifica|notifique|amanha|hoje|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\d{1,2}[/:]\d{1,2}|\d{1,2}h\b/.test(text))return "Esse pedido inclui prazo ou aviso. Para não perder essa parte, diga se quer registrar apenas a pendência sem prazo ou criar um lembrete com dia e hora. Ainda não registrei nem agendei um aviso.";
 if(intent.factKey || intent.factValue)return "Essa mensagem reúne atualização de informação e pendência. Vamos registrar uma de cada vez: qual você quer primeiro?";
 if(intent.waitingFor && !mentionsName(source.text,intent.waitingFor))return "Quem ou o que você está aguardando? Preciso dessa informação explícita para não atribuir a pendência à pessoa errada.";
 if(intent.waitingFor && intent.pendingState && intent.pendingState!=="waiting")return "Você quer deixar essa pendência aguardando retorno ou usar outro estado? Preciso esclarecer antes de alterar.";
 if(intent.pendingState==="waiting" && !/\b(?:aguardando|aguardar|esperando|depende|dependente)\b/.test(text))return "Você quer deixar essa pendência aguardando alguém ou manter como pendente?";
 const title=(intent.action==="create_subject_pending"?intent.title:intent.search)?.trim();
 if(!title || title.length>200)return "Qual é o título exato da pendência desse projeto?";
 const key=normalizeName(title);
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 const eventId=`subject_pending_change:${sourceMessageId}`;
 if(await tx.event.findFirst({where:{id:eventId,userId:user.id}}))return "Essa alteração de pendência já foi registrada.";
 if(intent.action==="create_subject_pending"){
  const replay=await tx.subjectPending.findUnique({where:{sourceMessageId}});
  if(replay)return "Essa pendência já foi registrada, sem criar outro aviso.";
  if(intent.pendingState && !open.includes(intent.pendingState))return "Uma nova pendência deve começar pendente ou aguardando.";
  const state=intent.pendingState || (intent.waitingFor?"waiting":"pending");
  if(state==="waiting" && !intent.waitingFor)return "Quem ou o que você está aguardando?";
  const existing=await tx.subjectPending.findFirst({where:{...scope,subjectId:subject.id,normalizedTitle:key,state:{in:open}}});
  if(existing)return `Essa pendência já está registrada em ${subject.name}. Para mudar a próxima ação, peça uma atualização. Nenhum aviso foi criado.`;
  if(await tx.subjectPending.count({where:{...scope,state:{in:open}}})>=100)return "Você atingiu 100 pendências abertas. Conclua ou cancele algumas antes de registrar outra.";
  const record=await tx.subjectPending.create({data:{userId:user.id,phoneNumberId,subjectId:subject.id,title,normalizedTitle:key,state,nextAction:intent.nextAction,waitingFor:intent.waitingFor,sourceMessageId}});
  await tx.event.create({data:{id:eventId,userId:user.id,type:"subject_pending_created",source:"secretaria",payload:{phoneNumberId,subjectId:subject.id,pendingId:record.id,sourceMessageId,state,nextAction:record.nextAction,waitingFor:record.waitingFor,version:0}}});
  return `Registrei em ${subject.name}:\n${pendingLine(record)}\nSem prazo definido e sem aviso agendado.`;
 }
 const matches=await tx.subjectPending.findMany({where:{...scope,subjectId:subject.id,normalizedTitle:key,state:{in:open}},take:2});
 if(matches.length!==1)return matches.length?"Há mais de uma pendência com esse título. Informe um título distinto para não alterar a errada.":"Não encontrei essa pendência aberta pelo título exato nesse projeto.";
 const current=matches[0],state=intent.pendingState || current.state;
 if(current.state==="waiting" && state==="pending" && !/\b(?:retoma|retome|retomar|reabre|reabra|reabrir|pendente|em andamento)\b/.test(text))return "Essa pendência estava aguardando retorno. Você quer retomar o trabalho ou apenas atualizar a próxima ação?";
 if(state==="completed" && !/\b(?:conclui|concluir|conclua|concluido|concluida|finaliza|finalize|finalizado|finalizada|resolvido|resolvida)\b/.test(text))return "Para concluir, diga explicitamente qual pendência foi concluída.";
 if(state==="cancelled" && !/\b(?:cancela|cancele|cancelar|cancelado|cancelada)\b/.test(text))return "Para cancelar, diga explicitamente qual pendência deve ser cancelada.";
 const waitingFor=state==="waiting"?(intent.waitingFor || current.waitingFor):null;
 if(state==="waiting" && !waitingFor)return "Quem ou o que você está aguardando?";
 const nextAction=open.includes(state)?intent.nextAction ?? current.nextAction:null;
 if(current.state===state && current.nextAction===nextAction && current.waitingFor===waitingFor)return "Essa pendência já está com essas informações. Mantive o registro existente.";
 const changed=await tx.subjectPending.updateMany({where:{id:current.id,version:current.version,...scope},data:{state,nextAction,waitingFor,version:{increment:1}}});
 if(!changed.count)return "Essa pendência mudou durante a atualização. Consulte a posição atual antes de tentar novamente.";
 await tx.event.create({data:{id:eventId,userId:user.id,type:"subject_pending_updated",source:"secretaria",payload:{phoneNumberId,subjectId:subject.id,pendingId:current.id,sourceMessageId,previous:{state:current.state,nextAction:current.nextAction,waitingFor:current.waitingFor,version:current.version},state,nextAction,waitingFor,version:current.version+1}}});
 return `Atualizei em ${subject.name}:\n${pendingLine({...current,state,nextAction,waitingFor})}\nNenhum aviso foi criado ou alterado.`;
}
