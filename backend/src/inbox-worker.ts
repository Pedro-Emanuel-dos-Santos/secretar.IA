import "dotenv/config";
import { prisma } from "./config/prisma";
import { processInboxBatch } from "./domain/inbox.processor";
import { conversationDependencies } from "./services/conversation.service";
import { relaySchedules } from "./domain/schedule.relay";
import { reminderQueue } from "./queue/reminder.queue";
import { relayReplies } from "./domain/reply.relay";
import { sendWhatsAppMessage } from "./services/whatsapp.service";
import { reconcileStoredDelivery } from "./domain/delivery.receipts";
import { relayDailySummaries } from "./domain/daily-summary";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (!phoneNumberId) throw new Error("Configure WHATSAPP_PHONE_NUMBER_ID antes de iniciar o worker de entrada.");
let stopping = false;
function stop() {
  if(stopping)return;stopping=true;
  setTimeout(()=>process.exit(1),120000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function main() {
  let nextSummaryScan=0;
  // API pre-deploy owns migrations. A new worker can start first during a
  // rolling deployment; wait without spending inbox attempts or AI tokens.
  let schemaReady=false;
  while(!stopping && !schemaReady){
    try{await prisma.subjectPending.findFirst({select:{id:true,nextAction:true,state:true,version:true}});await prisma.appointment.findFirst({select:{id:true}});await prisma.knowledgeFact.findFirst({select:{id:true}});await prisma.reminder.findFirst({select:{taskProgress:true,waitingFor:true,progressUpdatedAt:true,scheduleTimezone:true,kind:true,digestKey:true,subjectId:true,deliveryRetryAt:true,deliveryAttempts:true}});await prisma.contactPreference.findFirst({select:{timezone:true,audioConsent:true,summaryEnabled:true,summaryTime:true}});await prisma.aiUsage.findFirst({select:{id:true,routingReason:true,providerAttempts:true,estimatedCostUsd:true}});schemaReady=true;}
    catch{console.error("Aguardando migração de compromissos e memória; mensagens preservadas.");await new Promise(resolve=>setTimeout(resolve,10000));}
  }
  console.log("Worker de entrada iniciado.");
  if (!process.env.WHATSAPP_ACCESS_TOKEN) console.error("Sem token de envio: respostas permanecerão pendentes.");
  while (!stopping) {
    try { await processInboxBatch(prisma, conversationDependencies, phoneNumberId!,()=>stopping); }
    catch { console.error("Falha ao preparar mensagens; consulte a operação."); }
    if(stopping)break;
    if(Date.now()>=nextSummaryScan){
      nextSummaryScan=Date.now()+30000;
      try { await relayDailySummaries(prisma,phoneNumberId!); }
      catch { console.error("Falha ao preparar resumos diários; próxima varredura preservada."); }
    }
    try { await relaySchedules(prisma, reminderQueue, { phoneNumberId: phoneNumberId!,shouldStop:()=>stopping }); }
    catch { console.error("Falha ao recuperar agendamentos; pendências preservadas no banco."); }
    if(stopping)break;
    if (process.env.WHATSAPP_ACCESS_TOKEN) {
      try { await relayReplies(prisma, sendWhatsAppMessage, phoneNumberId!, id => reconcileStoredDelivery(prisma, phoneNumberId!, id),()=>stopping); }
      catch { console.error("Falha ao confirmar respostas; consulte os estados persistidos."); }
    }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await prisma.$disconnect();
  await reminderQueue.close();
}

main().catch(() => { console.error("Worker de entrada encerrado com erro."); process.exit(1); });
