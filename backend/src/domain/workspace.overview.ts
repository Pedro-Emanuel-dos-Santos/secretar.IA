import type { Prisma } from "@prisma/client";
import { contactTimezone } from "./preferences";
import { brasiliaDay,calendarDay } from "./day.overview";
import { reminderScope } from "./reminder.management";
import { factProvenance,factOriginSelection } from "./fact.provenance";
import type { AIInterpretation } from "../types/ai.types";
import { counted } from "./reply.language";

export async function executeWorkspaceOverview(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,now=new Date()){
 if(intent.subject)return "Para um assunto específico, diga como está esse projeto ou cliente. O painel geral reúne todos os cadastros.";
 if(intent.agendaPeriod || intent.rangeStart || intent.rangeEnd || intent.datetime || intent.taskFilter)return "Você quer o acompanhamento geral ou a agenda de um período? O painel de atenção considera o restante de hoje e os acompanhamentos abertos.";
 if(!intent.overviewKind)return "Você quer uma visão dos projetos, dos clientes ou do que precisa da sua atenção?";
 return intent.overviewKind==="waiting"?waitingOverview(phone,phoneNumberId,tx):intent.overviewKind==="attention"?attentionOverview(phone,phoneNumberId,tx,now):portfolioOverview(phone,phoneNumberId,tx,intent.overviewKind==="projects"?"project":intent.overviewKind==="clients"?"client":undefined);
}

const clip=(value:string,max=110)=>value.replace(/\s+/g," ").trim().slice(0,max);
function bounded(lines:string[],limit=3400){let text="",shown=0;for(const line of lines){if(text.length+line.length+1>limit)break;text+=(text?"\n":"")+line;shown++;}return text+(shown<lines.length?"\nHá mais registros. Consulte um projeto ou uma lista específica para continuar.":"");}
const pendingScope=(phone:string,phoneNumberId:string)=>({user:{phone},phoneNumberId,state:{in:["pending","waiting"]}});

export async function waitingOverview(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient){
 const pending={user:{phone},phoneNumberId,state:"waiting"},tasks={...reminderScope(phone,phoneNumberId),state:"active",taskProgress:"waiting",appointmentId:null};
 const include={subject:{select:{name:true,kind:true}}} as const;
 const [pendingRows,pendingCount,taskRows,taskCount]=await Promise.all([
  tx.subjectPending.findMany({where:pending,include,orderBy:[{updatedAt:"asc"},{id:"asc"}],take:41}),tx.subjectPending.count({where:pending}),
  tx.reminder.findMany({where:tasks,include,orderBy:[{updatedAt:"asc"},{id:"asc"}],take:41}),tx.reminder.count({where:tasks}),
 ]);
 if(!pendingCount && !taskCount)return "Não encontrei pendências ou tarefas aguardando retorno nesta conta.";
 const groups=new Map<string,{name:string;rows:string[]}>();
 for(const row of [...pendingRows.map(r=>({...r,type:"Pendência sem prazo"})),...taskRows.map(r=>({...r,type:"Tarefa com aviso registrado"}))]){
  const name=row.waitingFor || "Retorno sem pessoa identificada",key=name.trim().toLocaleLowerCase("pt-BR"),group=groups.get(key) || {name,rows:[]};
  group.rows.push(`• ${clip(row.title)}${row.subject?` (${row.subject.kind==="project"?"projeto":"cliente"} ${clip(row.subject.name,55)})`:""}\n  ${row.type}${"nextAction" in row && row.nextAction?`; próxima ação: ${clip(row.nextAction,130)}`:""}`);groups.set(key,group);
 }
 const lines=[`${counted(pendingCount+taskCount,"acompanhamento aguardando","acompanhamentos aguardando")} retorno: ${counted(pendingCount,"pendência sem prazo","pendências sem prazo")} e ${counted(taskCount,"tarefa com aviso registrado","tarefas com aviso registrado")}.`];
 for(const group of [...groups.values()].slice(0,6)){lines.push(`\nAguardando: ${clip(group.name,85)}`,...group.rows.slice(0,2));if(group.rows.length>2)lines.push(`Há mais ${group.rows.length-2} itens dessa referência na amostra.`);}
 if(groups.size>6 || pendingCount>pendingRows.length || taskCount>taskRows.length)lines.push("\nA lista é parcial. Consulte as pendências de um projeto ou liste as tarefas em espera para continuar.");
 lines.push("\nAgrupei pelas pessoas ou referências que você informou.");
 return bounded(lines);
}

export async function portfolioOverview(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,kind?:"project"|"client"){
 const scope={user:{phone},phoneNumberId,...(kind?{kind}:{})},pending={...pendingScope(phone,phoneNumberId),subject:scope};
 const [subjects,total,openCount,waitingCount,timezone]=await Promise.all([
  tx.businessSubject.findMany({where:scope,orderBy:[{updatedAt:"desc"},{id:"asc"}],take:7,include:{facts:{where:{key:"status",supersededAt:null},include:{sourceMessage:{select:factOriginSelection}},orderBy:[{revision:"desc"},{id:"asc"}],take:1},pendings:{where:pendingScope(phone,phoneNumberId),orderBy:[{updatedAt:"asc"},{id:"asc"}],take:3},_count:{select:{pendings:{where:pendingScope(phone,phoneNumberId)}}}}}),
  tx.businessSubject.count({where:scope}),tx.subjectPending.count({where:pending}),tx.subjectPending.count({where:{...pending,state:"waiting"}}),contactTimezone(tx,phone,phoneNumberId),
 ]);
 const noun=kind==="project"?"projetos":kind==="client"?"clientes":"projetos e clientes";
 if(!total)return `Ainda não há ${noun} cadastrados nesta conta. Você pode começar contando o nome de um projeto e uma informação que quer guardar sobre ele.`;
 const lines=[`Visão dos seus ${noun}:`,`${counted(total,"cadastro","cadastros")} · ${counted(openCount,"pendência sem prazo","pendências sem prazo")}, sendo ${waitingCount} aguardando retorno.`];
 for(const subject of subjects.slice(0,6)){
  let block=`\n${subject.kind==="project"?"Projeto":"Cliente"}: ${clip(subject.name,75)}`;
  const status=subject.facts[0];if(status)block+=`\nStatus informado: ${clip(status.value,130)}\n${factProvenance(status,phone,phoneNumberId,timezone)}`;
  block+=`\n${counted(subject._count.pendings,"pendência aberta","pendências abertas")}.`;
  for(const item of subject.pendings.slice(0,2))block+=`\n• ${clip(item.title)}${item.state==="waiting"?` — aguardando ${clip(item.waitingFor || "retorno",60)}`:""}${item.nextAction?`\n  Próxima ação: ${clip(item.nextAction,140)}`:"\n  Próxima ação ainda não registrada."}`;
  if(subject._count.pendings>2)block+="\nHá outras pendências nesse assunto.";
  lines.push(block);
 }
 if(total>6)lines.push(`\nMostrei até seis cadastros atualizados recentemente, de ${total}. Consulte o projeto ou cliente pelo nome para ver seus detalhes.`);
 lines.push("\nEssas pendências não têm prazo ou aviso agendado. Para os horários, consulte sua agenda.");
 return bounded(lines);
}

export async function attentionOverview(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,now=new Date()){
 const timezone=await contactTimezone(tx,phone,phoneNumberId),{end}=brasiliaDay(now,timezone),pending=pendingScope(phone,phoneNumberId);
 const base={...reminderScope(phone,phoneNumberId),state:"active",appointmentId:null,taskProgress:"pending"};
 const earlier={...base,remindAt:{lt:now}},today={...base,remindAt:{gte:now,lt:end}};
 const events={user:{phone},phoneNumberId,state:"active",startsAt:{lt:end},OR:[{startsAt:{gte:now}},{endsAt:{gt:now}}]};
 const include={subject:{select:{name:true,kind:true}}} as const;
 const [pastRows,pastCount,todayRows,todayCount,appointments,eventCount,waitingRows,waitingCount,actionRows,actionCount,withoutNext,preference]=await Promise.all([
  tx.reminder.findMany({where:earlier,include,orderBy:[{remindAt:"asc"},{id:"asc"}],take:3}),tx.reminder.count({where:earlier}),
  tx.reminder.findMany({where:today,include,orderBy:[{remindAt:"asc"},{id:"asc"}],take:3}),tx.reminder.count({where:today}),
  tx.appointment.findMany({where:events,include,orderBy:[{startsAt:"asc"},{id:"asc"}],take:3}),tx.appointment.count({where:events}),
  tx.subjectPending.findMany({where:{...pending,state:"waiting"},include,orderBy:[{updatedAt:"asc"},{id:"asc"}],take:3}),tx.subjectPending.count({where:{...pending,state:"waiting"}}),
  tx.subjectPending.findMany({where:{...pending,state:"pending"},include,orderBy:[{updatedAt:"asc"},{id:"asc"}],take:3}),tx.subjectPending.count({where:{...pending,state:"pending"}}),
  tx.subjectPending.count({where:{...pending,nextAction:null}}),tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone}}}),
 ]);
 const moment=(at:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(at);
 const label=(row:{title:string;subject?:{name:string;kind:string}|null})=>clip(row.title)+(row.subject?` (${row.subject.kind==="project"?"projeto":"cliente"} ${clip(row.subject.name,55)})`:"");
 const lines=[`Seu acompanhamento — ${moment(now)}. Fuso: ${timezone}.`];
 if(preference?.remindersPaused)lines.push("Seus avisos estão pausados.");
 if(!pastCount && !todayCount && !eventCount && !waitingCount && !actionCount)return lines.concat("Não encontrei tarefas com aviso anterior ou para o restante de hoje, compromissos em andamento/próximos hoje ou pendências de projetos abertas.").join("\n");
 if(pastCount){lines.push(`\n${pastCount} tarefas ainda abertas com horário de aviso anterior (isso não confirma prazo vencido):`);for(const row of pastRows)lines.push(`• ${label(row)} — aviso de ${moment(row.remindAt)}${["missed","blocked_paused","provider_rejected","scheduling_failed"].includes(row.status)?"; envio não confirmado":""}`);if(pastCount>pastRows.length)lines.push("Há mais tarefas com avisos anteriores.");}
 if(eventCount){lines.push(`\n${eventCount} compromissos em andamento ou no restante de hoje:`);for(const row of appointments)lines.push(`• ${label(row)} — ${moment(row.startsAt)}${row.endsAt?` até ${moment(row.endsAt)}`:""}`);if(eventCount>appointments.length)lines.push("Há mais compromissos hoje.");}
 if(todayCount){lines.push(`\n${todayCount} tarefas com aviso no restante de hoje:`);for(const row of todayRows)lines.push(`• ${label(row)} — ${moment(row.remindAt)}`);if(todayCount>todayRows.length)lines.push("Há outros avisos hoje.");}
 if(waitingCount){lines.push(`\n${waitingCount} pendências aguardando retorno, das menos atualizadas para as mais recentes:`);for(const row of waitingRows){const days=Math.max(0,Math.round((calendarDay(now.getTime(),timezone)-calendarDay(row.updatedAt.getTime(),timezone))/86400000));lines.push(`• ${label(row)} — aguardando ${clip(row.waitingFor || "retorno",70)}${days?`; sem atualização há ${days} dia(s)`:""}${row.nextAction?`\n  Próxima ação: ${clip(row.nextAction,140)}`:""}`);}if(waitingCount>waitingRows.length)lines.push("Há outros retornos aguardando.");}
 if(actionCount){lines.push(`\n${actionCount} pendências em andamento, das menos atualizadas para as mais recentes:`);for(const row of actionRows)lines.push(`• ${label(row)}\n  ${row.nextAction?`Próxima ação: ${clip(row.nextAction,140)}`:"Próxima ação ainda não registrada."}`);if(actionCount>actionRows.length)lines.push("Há outras pendências em andamento.");}
 if(withoutNext)lines.push(`\n${withoutNext} pendências abertas ainda não têm próxima ação registrada.`);
 lines.push("\nAcompanhamentos de projetos acima não têm prazo nem aviso. A ordem considera horários e atualização dos registros, não uma prioridade que você tenha definido.");
 return bounded(lines);
}
