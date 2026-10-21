import type { Prisma, PrismaClient } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
type Store=Pick<PrismaClient,"event"|"incomingMessage">;
export type TaskList={id:string;items:{id:string;version:number;title:string;remindAt:string;state:string;taskProgress:string}[]};
export async function shownTaskList(store:Store,phone:string,phoneNumberId:string,now:Date):Promise<TaskList|null>{
 const event=await store.event.findFirst({where:{type:"task_list_presented",user:{phone},createdAt:{gte:new Date(now.getTime()-15*60000),lte:now},payload:{path:["phoneNumberId"],equals:phoneNumberId}},orderBy:[{createdAt:"desc"},{id:"desc"}]});
 if(!event)return null;
 const payload=event.payload as any;
 if(typeof payload.sourceMessageId!=="string" || !Array.isArray(payload.items) || !payload.items.length || payload.items.length>10)return null;
 const latest=await store.incomingMessage.findFirst({where:{phone,phoneNumberId,reply:{status:"provider_accepted",finishedAt:{lte:now}}},orderBy:[{reply:{finishedAt:"desc"}},{id:"desc"}],select:{id:true}});
 if(latest?.id!==payload.sourceMessageId)return null;
 if(!payload.items.every((item:any)=>typeof item.id==="string" && Number.isSafeInteger(item.version) && typeof item.title==="string" && typeof item.remindAt==="string" && typeof item.state==="string" && typeof item.taskProgress==="string"))return null;
 return {id:event.id,items:payload.items};
}
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const ordinalWords=["primeir","segund","terceir","quart","quint","sext","setim","oitav","non","decim"];
export function ordinalIndex(text:string):number|null{
 const s=normalize(text);
 const pattern=/\b(?:(?:o|a)\s+(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa]|non[oa]|decim[oa]|\d{1,2}[ºª])|(?:item|numero)\s+(\d{1,2}))(?=$|[\s,.!?;])/g;
 const matches=[...s.matchAll(pattern)].filter(match=>!/(?:para|na|da|de|ate)\s+$/.test(s.slice(0,match.index)));if(!matches.length)return null;
 if(matches.length!==1)return -1;
 const value=(matches[0][1] || matches[0][2]).replace(/[ºª]$/,""),number=Number(value);
 return Number.isInteger(number)?number-1:ordinalWords.findIndex(word=>value.startsWith(word));
}
export function applyTaskSelection(intent:AIInterpretation,text:string,list:TaskList|null){
 delete intent.selectionListId;delete intent.selectionIndex;
 if(!["conversation","complete_reminder","cancel_reminder","reschedule_reminder","edit_reminder","mark_waiting","reschedule_appointment","cancel_appointment","edit_note","delete_note"].includes(intent.action))return;
 const index=ordinalIndex(text);if(index===null)return;
 const s=normalize(text);
 const fail=(reply:string)=>{intent.action="conversation";intent.reply=reply;intent.reminderId=null;intent.search=null;intent.title=null;intent.datetime=null;};
 if(["reschedule_appointment","cancel_appointment","edit_note","delete_note"].includes(intent.action)){fail("Para esse tipo de registro, preciso do título ou texto. A seleção por número está disponível para a lista de tarefas.");return;}
 if(/\b(?:compromisso|reuniao|cliente|anotacao|nota|projeto)\b/.test(s)){fail("A seleção por número está disponível para a lista de tarefas. Qual é o título do registro que você quer alterar?");return;}
 if(!list || index<0 || !list.items[index]){fail("Preciso de uma lista recente para identificar esse item. Peça para listar suas tarefas novamente.");return;}
 const item=list.items[index];
 if(/\b(?:nao|nunca|talvez|se)\b/.test(s) || intent.cancelSeries){fail("Você quer alterar só esse item? Diga a ação e o título da tarefa para eu confirmar o alvo.");return;}
 const action=/\b(?:conclui|conclua|concluir|finaliza|finalize|termina|termine)\b|\bmarca\b.*\b(?:feito|feita|concluido|concluida)\b/.test(s)?"complete_reminder"
  : /\b(?:cancela|cancele|cancelar)\b/.test(s)?"cancel_reminder"
  : /\b(?:adia|adie|adiar|reagenda|reagende|muda|mude)\b/.test(s)?"reschedule_reminder"
  : /\b(?:corrige|corrija|renomeia|renomeie)\b/.test(s)?"edit_reminder"
  : /\b(?:aguardando|esperando)\b/.test(s)?"mark_waiting":null;
 if(!action){fail(`O item ${index+1} é: ${item.title}. O que você quer fazer com essa tarefa?`);return;}
 if(intent.action!==action){fail(`O item ${index+1} é: ${item.title}. Confirme o que deseja fazer com essa tarefa.`);return;}
 intent.reminderId=item.id;intent.search=null;intent.title=null;intent.expectedVersion=item.version;
 intent.selectionListId=list.id;intent.selectionIndex=index;intent.cancelSeries=false;
}
export async function validateTaskSelection(tx:Prisma.TransactionClient,phone:string,phoneNumberId:string,intent:AIInterpretation){
 if(!intent.selectionListId)return true;
 const list=await shownTaskList(tx,phone,phoneNumberId,new Date());
 const item=list?.items[intent.selectionIndex ?? -1];
 if(!item || list?.id!==intent.selectionListId || item.id!==intent.reminderId)return false;
 await tx.$queryRaw`SELECT id FROM "Reminder" WHERE id=${item.id} FOR UPDATE`;
 const current=await tx.reminder.findFirst({where:{id:item.id,user:{phone},OR:[{sourceMessage:{phoneNumberId}},{scheduleOutbox:{phoneNumberId}}]}});
 return !!current && current.scheduleVersion===item.version && current.state===item.state && current.taskProgress===item.taskProgress && current.title===item.title && current.remindAt.toISOString()===item.remindAt;
}
