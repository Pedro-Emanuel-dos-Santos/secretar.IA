import type { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
import { parseInterpretation } from "./interpretation.validation";
import { validateReminder } from "./reminder.validation";
import { persistReminderInTransaction } from "./reminder.creator";
import { executeAppointment } from "./appointments";
import { executeNote } from "./notes";
import { contactTimezone } from "./preferences";
import { ReminderQuotaError,RemindersPausedError } from "./reminder.limits";
import { TaskSubjectError } from "./task.subject";

type Source={id:string;phone:string;phoneNumberId:string;text:string;receivedAt:Date;mediaId?:string|null};
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[.!]+$/,"").trim();
// Background subjects are not instructions to file every new action there.
// Retain only a named link or a link already presented in the current proposal.
export function groundPlanSubjects(steps:AIInterpretation[],text:string,previousSubjects:string[]=[]){
 const words=(s:string)=>normalize(s).replace(/[^\p{L}\p{N}]+/gu," ").trim();
 const source=` ${words(text)} `,previous=new Set(previousSubjects.map(words));
 return steps.map(step=>{
  if(step.subject && (source.includes(` ${words(step.subject)} `) || previous.has(words(step.subject))))return {...step};
  const {subject,subjectKind,...unlinked}=step;return unlinked;
 });
}
export function assistantPlanCommand(text:string):"confirm_assistant_plan"|"discard_assistant_plan"|null{
 const s=normalize(text);
 if(/^(?:confirmar plano|confirma o plano|pode executar o plano|sim|bora|manda bala|pode seguir|(?:(?:sim|beleza|legal|show|certo|combinado|ok),?\s+)?(?:pode fazer|pode executar|faz isso(?: pra mim)?)(?:,? por favor)?)$/.test(s))return "confirm_assistant_plan";
 if(/^(?:descartar plano|descarta o plano|cancela (?:esse|o) plano|nao execute o plano|(?:nao,? )?deixa pra la)$/.test(s))return "discard_assistant_plan";
 return null;
}
export const explicitPlanCommand=(text:string)=>!!assistantPlanCommand(text) && /\bplano\b/.test(normalize(text));
export function planCommandIntent(action:"confirm_assistant_plan"|"discard_assistant_plan"):AIInterpretation{return {action,reply:"Vou conferir o plano que combinamos.",title:null,description:null,datetime:null,amount:null,category:null};}
const scope=(phone:string,phoneNumberId:string)=>({user:{phone},type:"assistant_plan",payload:{path:["phoneNumberId"],equals:phoneNumberId}});
export async function availableAssistantPlan(tx:Pick<Prisma.TransactionClient,"event"|"incomingMessage">,source:Omit<Source,"id"> & {id?:string}){
 const event=await tx.event.findFirst({where:scope(source.phone,source.phoneNumberId),orderBy:[{createdAt:"desc"},{id:"desc"}]});
 const data=event?.payload as any;if(!event || data?.status!=="proposed")return null;
 const latest=await tx.incomingMessage.findFirst({where:{phone:source.phone,phoneNumberId:source.phoneNumberId,...(source.id?{id:{not:source.id}}:{}),receivedAt:{lte:source.receivedAt},status:{in:["completed","reply_pending","reply_sending","reply_unknown"]}},orderBy:[{receivedAt:"desc"},{id:"desc"}],select:{id:true,reply:{select:{status:true,finishedAt:true}}}});
 if(!latest || latest.id!==data.sourceMessageId || latest.reply?.status!=="provider_accepted" || !latest.reply.finishedAt || latest.reply.finishedAt>source.receivedAt)return null;
 return {event,data,expired:!Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt)<=Date.now()};
}
function validateSteps(steps:AIInterpretation[],phone:string){
 for(const [index,step] of steps.entries()){
  if(step.subject && (!step.subject.trim() || step.subject.trim().length>120))return `Precisamos do nome completo do cliente ou projeto da ação ${index+1}, com até 120 caracteres.`;
  if(step.action==="save_note"){
   const text=step.description?.trim() || step.title?.trim();if(!text || text.length>500)return `A anotação ${index+1} precisa de um texto com até 500 caracteres para você revisar no plano.`;
  }else{
   if(step.description && step.description.trim().length>300)return `Os detalhes da ação ${index+1} precisam de até 300 caracteres para caber na revisão.`;
   if(!step.title?.trim() || step.title.length>180 || !step.datetime)return `Falta o título ou o dia e horário da ação ${index+1}. Vamos definir isso antes de executar o plano.`;
   try{validateReminder({phone,title:step.title,remindAt:step.datetime});}catch{return `O dia e horário da ação ${index+1} precisam estar válidos e no futuro.`;}
   if(step.recurrence || step.draft)return "Vamos definir as ações avulsas e os horários primeiro.";
  }
 }
 return null;
}
function preview(steps:AIInterpretation[],timezone:string,rationale?:string|null){
 const date=(value:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(new Date(value));
 const items=steps.map((step,i)=>{
  if(step.action==="save_note")return `${i+1}. Guardar anotação: ${step.description?.trim() || step.title?.trim()}`;
  return `${i+1}. ${step.action==="create_reminder"?"Criar lembrete":"Marcar compromisso"}: ${step.title?.trim()} — ${date(step.datetime!)}${step.subject?` (${step.subjectKind==="project"?"projeto":"cliente"} ${step.subject})`:""}${step.durationMinutes?`; duração de ${step.durationMinutes} min`:""}${step.action==="create_appointment"?`; avisos: ${(step.alertMinutes || [0]).map(n=>n===0?"na hora":`${n} min antes`).join(", ")}`:""}${step.description?.trim()?`\n  Detalhes: ${step.description.trim()}`:""}`;
 });
 const explanation=rationale?.trim(),intro=explanation && explanation.length<=400 && !/\b(?:anotei|agendei|criei|salvei|conclui|enviei|liguei|executei)\b/.test(normalize(explanation))?explanation+"\n\n":"";
 return intro+"Posso organizar assim:\n"+items.join("\n")+`\nFuso: ${timezone}.\nAinda não executei essas ações. Se estiver certo, pode responder “pode fazer”. Para cancelar, “descartar plano”. A proposta vale por 15 minutos, enquanto esta for a última proposta respondida.`;
}
class PlanRefusal extends Error{}
export async function executeAssistantPlan(tx:Prisma.TransactionClient,source:Source,intent:AIInterpretation){
 const original=await tx.incomingMessage.findFirst({where:{id:source.id,phone:source.phone,phoneNumberId:source.phoneNumberId}});
 if(!original)throw Error("Origem do plano incompatível.");source=original;
 const user=await tx.user.upsert({where:{phone:source.phone},create:{phone:source.phone},update:{updatedAt:new Date()}});
 if(intent.action==="assistant_plan"){
  const existing=await tx.event.findUnique({where:{id:`assistant_plan:${source.id}`}});
  if(existing){const data=existing.payload as any;return data.status==="proposed"?preview(parseInterpretation(JSON.stringify(data.request)).planSteps!,await contactTimezone(tx,source.phone,source.phoneNumberId),data.request.description):"Esse plano já foi encerrado. Podemos preparar outro.";}
  const request=parseInterpretation(JSON.stringify(intent));
  const previous=await availableAssistantPlan(tx,source);
  request.planSteps=groundPlanSubjects(request.planSteps!,source.text,previous && !previous.expired?(previous.data.request.planSteps || []).map((s:AIInterpretation)=>s.subject).filter(Boolean):[]);
  if(/\b(projeto|cliente|assunto)\b/i.test(source.text) && intent.planSteps!.some((s,i)=>s.subject && !request.planSteps![i].subject))return "Antes de montar o plano, qual é o nome do projeto ou cliente ao qual essas ações pertencem?";
  const steps=request.planSteps;
  const invalid=validateSteps(steps,source.phone);if(invalid)return invalid;
  const timezone=await contactTimezone(tx,source.phone,source.phoneNumberId),text=preview(steps,timezone,request.description);if(text.length>3600)return "Esse plano ficou longo para revisar com clareza. Vamos organizá-lo em partes menores.";
  await tx.event.create({data:{id:`assistant_plan:${source.id}`,userId:user.id,type:"assistant_plan",source:"secretaria",payload:JSON.parse(JSON.stringify({phoneNumberId:source.phoneNumberId,sourceMessageId:source.id,status:"proposed",timezone,expiresAt:new Date(Date.now()+15*60000).toISOString(),request}))}});
  return text;
 }
 if(source.mediaId)return "Confirme ou descarte o plano por texto, depois de revisar as ações propostas.";
 if(assistantPlanCommand(source.text)!==intent.action)return "Ainda não executei o plano. Revise as ações propostas e me diga se posso fazer.";
 const replay=await tx.event.findFirst({where:{...scope(source.phone,source.phoneNumberId),AND:[{payload:{path:["confirmationMessageId"],equals:source.id}}]}});
 if(replay){const data=replay.payload as any;return data.result || "Esse plano já foi processado.";}
 const current=await availableAssistantPlan(tx,source);if(!current || current.expired)return "Não há um plano recente com envio confirmado para executar. Podemos preparar uma nova proposta.";
 const {event,data}=current;
 if(intent.action==="discard_assistant_plan"){
  const result="Descartei o plano. Podemos ajustar a ideia e montar outro.";await tx.event.update({where:{id:event.id},data:{payload:{...data,status:"discarded",confirmationMessageId:source.id,result}}});return result;
 }
 if(data.timezone!==await contactTimezone(tx,source.phone,source.phoneNumberId))return "Seu fuso mudou depois da proposta. Vamos revisar os horários do plano antes de executar.";
 const steps=parseInterpretation(JSON.stringify(data.request)).planSteps!;
 const invalid=validateSteps(steps,source.phone);if(invalid)return invalid;
 await tx.$executeRawUnsafe("SAVEPOINT assistant_plan_apply");
 try{
  const results:string[]=[];
  for(const [index,step] of steps.entries()){
   const child=await tx.incomingMessage.create({data:{id:`plan_step:${event.id}:${index}`,phone:source.phone,phoneNumberId:source.phoneNumberId,providerMessageId:`plan_step:${event.id}:${index}`,text:(await tx.incomingMessage.findUniqueOrThrow({where:{id:data.sourceMessageId}})).text,receivedAt:source.receivedAt,status:"plan_step",interpretation:JSON.parse(JSON.stringify(step))}});
   if(step.action==="save_note")results.push(await executeNote(source.phone,source.phoneNumberId,step,tx));
   else if(step.action==="create_reminder"){
    const row=await persistReminderInTransaction({phone:source.phone,title:step.title!,description:step.description || undefined,remindAt:step.datetime!,subject:step.subject || undefined,subjectKind:step.subjectKind},tx,{phoneNumberId:source.phoneNumberId,sourceMessageId:child.id});
    results.push(`Lembrete registrado: ${row.title}. Agendamento do envio em confirmação.`);
   }else{
    const reply=await executeAppointment(source.phone,source.phoneNumberId,step,tx,child.id);
    if(!await tx.appointment.findFirst({where:{sourceMessageId:child.id,userId:user.id,phoneNumberId:source.phoneNumberId,state:"active"}}))throw new PlanRefusal(reply);
    results.push(reply);
   }
  }
  const result="Plano aplicado:\n"+results.map((r,i)=>`${i+1}. ${r}`).join("\n");
  await tx.event.update({where:{id:event.id},data:{payload:{...data,status:"applied",confirmationMessageId:source.id,result}}});await tx.$executeRawUnsafe("RELEASE SAVEPOINT assistant_plan_apply");return result;
 }catch(error){
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT assistant_plan_apply");await tx.$executeRawUnsafe("RELEASE SAVEPOINT assistant_plan_apply");
  const reason=error instanceof PlanRefusal?error.message:error instanceof RemindersPausedError || error instanceof ReminderQuotaError || error instanceof TaskSubjectError?error.reply:null;
  if(!reason)throw error;
  const result=`Não apliquei nenhuma das ações do plano. ${reason}\nPodemos ajustar o plano e tentar novamente.`;
  await tx.event.update({where:{id:event.id},data:{payload:{...data,status:"failed",confirmationMessageId:source.id,result}}});return result;
 }
}
