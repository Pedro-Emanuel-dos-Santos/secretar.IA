import "dotenv/config";
import { prisma } from "./config/prisma";
import { processInboxBatch } from "./domain/inbox.processor";
import { conversationDependencies } from "./services/conversation.service";
import { relaySchedules } from "./domain/schedule.relay";
import { reminderQueue } from "./queue/reminder.queue";
import { relayReplies } from "./domain/reply.relay";
import { sendWhatsAppMessage } from "./services/whatsapp.service";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (!phoneNumberId) throw new Error("Configure WHATSAPP_PHONE_NUMBER_ID antes de iniciar o worker de entrada.");
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.log("Worker de entrada iniciado.");
  if (!process.env.WHATSAPP_ACCESS_TOKEN) console.error("Sem token de envio: respostas permanecerão pendentes.");
  while (!stopping) {
    try { await processInboxBatch(prisma, conversationDependencies, phoneNumberId!); }
    catch { console.error("Falha ao preparar mensagens; consulte a operação."); }
    try { await relaySchedules(prisma, reminderQueue, { phoneNumberId: phoneNumberId! }); }
    catch { console.error("Falha ao recuperar agendamentos; pendências preservadas no banco."); }
    if (process.env.WHATSAPP_ACCESS_TOKEN) {
      try { await relayReplies(prisma, sendWhatsAppMessage, phoneNumberId!); }
      catch { console.error("Falha ao confirmar respostas; consulte os estados persistidos."); }
    }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await prisma.$disconnect();
}

main().catch(() => { console.error("Worker de entrada encerrado com erro."); process.exitCode = 1; });
