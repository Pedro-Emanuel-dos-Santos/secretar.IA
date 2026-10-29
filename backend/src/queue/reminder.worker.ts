import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendWhatsAppReminder } from "../services/whatsapp.service";
import { reconcileStoredDelivery } from "../domain/delivery.receipts";
import {maximumLateness} from "../domain/reminder.execution";
import {createReminderProcessor} from "./reminder.processor";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (!phoneNumberId) throw new Error("Configure WHATSAPP_PHONE_NUMBER_ID.");

const maxLateMs = maximumLateness();
const worker = new Worker("reminders",createReminderProcessor(prisma,phoneNumberId,sendWhatsAppReminder,
 id=>reconcileStoredDelivery(prisma,phoneNumberId,id),{maxLateMs}), { connection: redisConnection, autorun:false });

worker.on("error", () => console.error("Worker de lembretes: falha de conexão."));

let stopping=false;
async function stop() {
  if(stopping)return;stopping=true;
  const deadline=setTimeout(()=>process.exit(1),30000);deadline.unref();
  try {await worker.close();await prisma.$disconnect();clearTimeout(deadline);process.exit(0);}
  catch {console.error("Worker de lembretes encerrado com pendências preservadas.");process.exit(1);}
}
process.on("SIGTERM",()=>void stop());
process.on("SIGINT",()=>void stop());

async function main(){
  // The API deployment runs additive migrations. Do not claim jobs before it
  // has added the fields needed by this generated Prisma client.
  while(!stopping){
    try{await prisma.reminder.findFirst({select:{id:true,appointmentId:true,appointmentOffsetMinutes:true,taskProgress:true,waitingFor:true,progressUpdatedAt:true,scheduleTimezone:true,kind:true,digestKey:true,subjectId:true,deliveryRetryAt:true,deliveryAttempts:true}});break;}
    catch{console.error("Aguardando migração dos avisos; fila preservada.");await new Promise(resolve=>setTimeout(resolve,10000));}
  }
  if(stopping)return;
  console.log("Worker de lembretes iniciado.");
  await worker.run();
}
main().catch(()=>{console.error("Worker de lembretes encerrado com erro.");process.exit(1);});
