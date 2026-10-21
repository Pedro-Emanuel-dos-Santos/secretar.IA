import type { PrismaClient, IncomingMessage } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ConversationDependencies, prepareConversation } from "./conversation.processor";
import { parseInterpretation } from "./interpretation.validation";
import { executeAction } from "./action.executor";
import { persistReminderInTransaction } from "./reminder.creator";
import { schedulingBackoff } from "./schedule.relay";
import { manageReminders } from "./reminder.management";
import { AudioRejectedError, audioFallback } from "./audio";
import { localCommand, executeLocalCommand } from "./local.commands";
import { requestBudget } from "./request.budget";
import { executeNote } from "./notes";
import { executeFact } from "./business.memory";
import { subjectOverview } from "./subject.overview";
import { agendaOverview } from "./agenda.overview";
import { executeAppointment } from "./appointments";
import { executePreferences,contactTimezone } from "./preferences";

type Store = Pick<PrismaClient, "incomingMessage" | "$transaction"> & Partial<Pick<PrismaClient,"aiUsage">>;
const leaseMs = 120_000;

async function finishFailure(store:Store,id:string,phase:"interpreting" | "executing",token:string | null,reason:string) {
  await store.$transaction(async tx=>{
    const changed=await tx.incomingMessage.updateMany({where:{id,status:{in:[phase,phase === "interpreting" ? "received" : "interpreted"]},leaseToken:token},
      data:{status:"reply_pending",leaseToken:null,leaseUntil:null,lastError:reason}});
    if (!changed.count) return;
    await tx.replyOutbox.upsert({where:{messageId:id},update:{},create:{messageId:id,text:phase === "interpreting"
      ? "Não consegui entender esse pedido agora. Pode tentar de novo com uma mensagem curta, incluindo a tarefa, o dia e o horário?"
      : "Não consegui confirmar esse pedido. Confira seus lembretes antes de tentar novamente."}});
  });
}

async function saveFailure(store: Store, id: string, token: string, phase: "interpreting" | "executing", attempt: number, max: number) {
  if (attempt >= max) return finishFailure(store,id,phase,token,phase+"_attempt_limit");
  await store.incomingMessage.updateMany({
    where: { id, status: phase, leaseToken: token },
    data: {
      status: phase === "interpreting" ? "received" : "interpreted",
      nextAttemptAt: new Date(Date.now() + schedulingBackoff(attempt)),
      leaseToken: null, leaseUntil: null, lastError: phase + "_failed",
      finishedAt: null,
    },
  });
}

async function prepareIntent(store: Store, row: IncomingMessage, deps: ConversationDependencies) {
  if (row.interpretationAttempts >= row.maxAttempts) {
    await finishFailure(store,row.id,"interpreting",row.leaseToken,"interpreting_attempt_limit");
    return;
  }
  const token = randomUUID();
  const now = new Date();
  const claim = await store.incomingMessage.updateMany({
    where: { id: row.id, interpretationAttempts: row.interpretationAttempts,
      OR: [{ status: "received", nextAttemptAt: { lte: now } }, { status: "interpreting", leaseUntil: { lte: now } }] },
    data: { status: "interpreting", startedAt: now, interpretationAttempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  if (!claim.count) return;
  try {
    const directCommand = localCommand(row.text) || (!row.mediaId && row.text.startsWith("sr1:"));
    const budgetReply = directCommand ? null : await requestBudget(store,row);
    let audioError = false;
    if (!budgetReply && row.mediaId && !row.transcribedAt) {
      try {
        if (!deps.transcribe) throw new AudioRejectedError("Áudio indisponível.");
        const text = await deps.transcribe({mediaId:row.mediaId,mediaMimeType:row.mediaMimeType,phoneNumberId:row.phoneNumberId,phone:row.phone});
        if (typeof text !== "string" || !text.trim() || text.length > 16000) throw new AudioRejectedError("Transcrição inválida.");
        const saved = await store.incomingMessage.updateMany({
          where:{id:row.id,status:"interpreting",leaseToken:token},data:{text,transcribedAt:new Date(),leaseUntil:new Date(Date.now()+leaseMs)},
        });
        if (!saved.count) return;
        row = {...row,text,transcribedAt:new Date()};
      } catch (error) {
        if (!(error instanceof AudioRejectedError) && row.interpretationAttempts + 1 < row.maxAttempts) throw error;
        audioError = true;
      }
    }
    const result = budgetReply || audioError ? {action:"conversation",title:null,description:null,datetime:null,amount:null,category:null,reply:budgetReply || audioFallback}
      : await prepareConversation(row, {...deps,
        interpret:async(context,onUsage)=>{
          if(store.aiUsage)await store.aiUsage.upsert({where:{messageId_attempt:{messageId:row.id,attempt:row.interpretationAttempts+1}},create:{messageId:row.id,attempt:row.interpretationAttempts+1,provider:"unknown"},update:{}});
          return deps.interpret(context,onUsage);
        },
        onUsage:async usage=>{
          if(store.aiUsage)await store.aiUsage.update({where:{messageId_attempt:{messageId:row.id,attempt:row.interpretationAttempts+1}},data:{...usage,model:usage.model || null,inputTokens:usage.inputTokens ?? null,outputTokens:usage.outputTokens ?? null,cachedInputTokens:usage.cachedInputTokens ?? null,elapsedMs:usage.elapsedMs ?? null}});
          if(deps.onUsage)await deps.onUsage(usage);
        }});
    await store.incomingMessage.updateMany({
      where: { id: row.id, status: "interpreting", leaseToken: token },
      data: { interpretation: JSON.parse(JSON.stringify(result)), status: "interpreted", nextAttemptAt: new Date(),
        leaseToken: null, leaseUntil: null, lastError: budgetReply ? "request_quota" : audioError ? "audio_unreadable" : null },
    });
  } catch {
    await saveFailure(store, row.id, token, "interpreting", row.interpretationAttempts + 1, row.maxAttempts);
  }
}

async function prepareAction(store: Store, row: IncomingMessage) {
  if (row.executionAttempts >= row.maxAttempts) {
    await finishFailure(store,row.id,"executing",row.leaseToken,"executing_attempt_limit");
    return false;
  }
  const token = randomUUID();
  const now = new Date();
  const claim = await store.incomingMessage.updateMany({
    where: { id: row.id, executionAttempts: row.executionAttempts,
      OR: [{ status: "interpreted", nextAttemptAt: { lte: now } }, { status: "executing", leaseUntil: { lte: now } }] },
    data: { status: "executing", executionAttempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  if (!claim.count) return false;
  try {
    return await store.$transaction(async tx => {
      // This write locks the row for the whole DB-only action. A reclaimed worker
      // cannot commit another action or change ownership while this transaction runs.
      const owned = await tx.incomingMessage.updateMany({
        where: { id: row.id, status: "executing", leaseToken: token },
        data: { leaseUntil: new Date(Date.now() + leaseMs) },
      });
      if (!owned.count) return false;
      const interpretation = parseInterpretation(JSON.stringify(row.interpretation));
      let refreshReminder = false;
      const command = localCommand(row.text);
      const timezone=await contactTimezone(tx,row.phone,row.phoneNumberId);
      const preference = !command && ["create_reminder","reschedule_reminder"].includes(interpretation.action)
        ? await tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId:row.phoneNumberId,phone:row.phone}}}) : null;
      const reply = command ? await executeLocalCommand(command,row.phone,row.phoneNumberId,tx,row)
        : preference?.remindersPaused ? "Seus avisos estão pausados. Envie RETOMAR antes de criar ou reagendar lembretes."
        : await executeAction(row.phone, interpretation, async input => {
        const reminder = await persistReminderInTransaction(input, tx, { phoneNumberId: row.phoneNumberId, sourceMessageId: row.id });
        refreshReminder = true;
        return reminder;
      }, intent => manageReminders(row.phone, row.phoneNumberId, intent, tx,row.id), intent=>executeNote(row.phone,row.phoneNumberId,intent,tx),
      intent=>intent.action==="agenda_overview"?agendaOverview(row.phone,row.phoneNumberId,tx,intent.agendaPeriod || "week",row.receivedAt,{subject:intent.subject || undefined,subjectKind:intent.subjectKind,rangeStart:intent.rangeStart,rangeEnd:intent.rangeEnd}):intent.action==="subject_overview"?subjectOverview(row.phone,row.phoneNumberId,intent,tx,row.receivedAt):["save_fact","search_facts","forget_fact"].includes(intent.action) ? executeFact(row.phone,row.phoneNumberId,intent,tx,row.id)
        : ["set_preferences","show_preferences","usage_summary"].includes(intent.action)?executePreferences(row.phone,row.phoneNumberId,intent,tx)
        : executeAppointment(row.phone,row.phoneNumberId,intent,tx,row.id),timezone);
      await tx.replyOutbox.create({ data: { messageId: row.id, text: reply, refreshReminder } });
      await tx.incomingMessage.update({
        where: { id: row.id }, data: { status: "reply_pending", leaseToken: null, leaseUntil: null, lastError: ["audio_unreadable","request_quota"].includes(row.lastError || "") ? row.lastError : null },
      });
      return true;
    });
  } catch {
    await saveFailure(store, row.id, token, "executing", row.executionAttempts + 1, row.maxAttempts);
    return false;
  }
}

export async function processInboxBatch(store: Store, deps: ConversationDependencies, phoneNumberId: string, shouldStop=()=>false) {
  const now = new Date();
  const rows = await store.incomingMessage.findMany({
    where: { phoneNumberId, OR: [
      { status: { in: ["received", "interpreted"] }, nextAttemptAt: { lte: now } },
      { status: { in: ["interpreting", "executing"] }, leaseUntil: { lte: now } },
    ] },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: 20,
  });
  let prepared = 0;
  for (const initial of rows) {
    if (shouldStop()) break;
    // Preserve a contact's conversation order, including during rolling deploys.
    // A later reply must not be interpreted before the previous action commits.
    if (!localCommand(initial.text) && typeof store.incomingMessage.findFirst === "function") {
      const earlier=await store.incomingMessage.findFirst({where:{phoneNumberId,phone:initial.phone,
        status:{in:["received","interpreting","interpreted","executing"]},
        OR:[{receivedAt:{lt:initial.receivedAt}},{receivedAt:initial.receivedAt,id:{lt:initial.id}}]},select:{id:true}});
      if(earlier)continue;
    }
    if (initial.status === "received" || initial.status === "interpreting") await prepareIntent(store, initial, deps);
    const row = await store.incomingMessage.findUnique({ where: { id: initial.id } });
    if (row && (row.status === "interpreted" || (row.status === "executing" && row.leaseUntil && row.leaseUntil <= new Date()))) {
      if (await prepareAction(store, row)) prepared++;
    }
  }
  return prepared;
}
