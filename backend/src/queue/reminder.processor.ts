import {DelayedError} from "bullmq";
import type {PrismaClient} from "@prisma/client";
import {deliverReminder} from "../domain/reminder.delivery";
import {maximumLateness,prepareReminderExecution} from "../domain/reminder.execution";

// Shared by the actual worker and isolated BullMQ journeys. Only the transport
// and clock are injected; claims, version checks and delivery persistence stay real.
export function createReminderProcessor(store:PrismaClient,phoneNumberId:string,
 send:Parameters<typeof deliverReminder>[3],reconcile?:(id:string)=>Promise<void>,
 options:{now?:()=>number;maxLateMs?:number}={}){
 const now=options.now || Date.now,maxLateMs=options.maxLateMs ?? maximumLateness();
 return async (job:{data:any;moveToDelayed(until:number,token?:string):Promise<unknown>},token?:string)=>{
  if(typeof job.data.reminderId!=="string" || !job.data.reminderId)throw Error("Job sem identidade persistente de lembrete.");
  const version=job.data.scheduleVersion ?? 0;
  if(!Number.isSafeInteger(version) || version<0)throw Error("Versão de agendamento inválida.");
  const decision=await prepareReminderExecution(store,job.data.reminderId,phoneNumberId,version,now(),maxLateMs);
  if(decision.kind==="defer"){await job.moveToDelayed(decision.until,token);throw new DelayedError();}
  if(decision.kind!=="ready")return;
  await deliverReminder(job.data.reminderId,phoneNumberId,store,send,version,reconcile);
 };
}
