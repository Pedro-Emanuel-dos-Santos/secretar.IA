import type { PrismaClient } from "@prisma/client";
import { WhatsAppPreflightError } from "./whatsapp.policy";
import type { ReminderControls } from "./reminder.buttons";
import { WhatsAppSendRejected,retryableRejection,templateRejection } from "./whatsapp.errors";
import { titledSubject } from "./reply.language";

type Store = Pick<PrismaClient, "reminder"|"$transaction">;
type Sender = (phone: string, text: string, controls?: ReminderControls) => Promise<unknown>;

export async function deliverReminder(reminderId: string, phoneNumberId: string, store: Store, send: Sender, expectedVersion = 0,
  reconcile?: (providerMessageId: string) => Promise<void>) {
  const reminder = await store.reminder.findUnique({
    where: { id: reminderId }, include: { user: true, scheduleOutbox: true,subject:{select:{name:true}} },
  });
  if (!reminder) return "missing";
  if (reminder.scheduleOutbox && reminder.scheduleOutbox.phoneNumberId !== phoneNumberId) throw new Error("Número comercial incompatível.");
  if ((reminder.scheduleVersion ?? 0) !== expectedVersion) return "stale";
  if(reminder.state!=="active")return "skipped";
  if(reminder.deliveryRetryAt && reminder.deliveryRetryAt.getTime()>Date.now())return "deferred";
  const claimed = await store.reminder.updateMany({
    where: { id: reminderId, scheduleVersion: expectedVersion, state: "active", status: { in: ["pending", "scheduled", "scheduling_pending", "scheduling_failed","delivery_retry"] } },
    data: { status: "sending", deliveryStartedAt: new Date(),deliveryAttempts:{increment:1},deliveryRetryAt:null },
  });
  if (!claimed.count) return "skipped";
  try {
    const late = Date.now() - reminder.remindAt.getTime() > 60_000;
    const text=`⏰ Lembrete${late ? " atrasado" : ""}: ${titledSubject(reminder.title,reminder.subject)}`+
      (reminder.appointmentId && reminder.description ? `\n${reminder.description.slice(0,300)}` : "");
    const result = await send(reminder.user.phone, text,
      reminder.appointmentId || reminder.kind==="daily_summary" ? undefined : { id: reminder.id, version: expectedVersion });
    const id = (result as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
    if (typeof id !== "string" || !id) throw new Error("Provedor não confirmou a identidade da mensagem.");
    await store.reminder.updateMany({
      where: { id: reminderId, status: "sending" }, data: { status: "provider_accepted", providerMessageId: id,...(reminder.kind==="daily_summary"?{state:"completed",taskProgress:"completed"}:{}) },
    });
    if (reconcile) {
      try { await reconcile(id); } catch { console.error("Recibo persistido aguarda reconciliação operacional."); }
    }
    return "provider_accepted";
  } catch (error) {
    const attempts=(reminder.deliveryAttempts || 0)+1;
    if(retryableRejection(error) && attempts<3 && reminder.scheduleOutbox){
      const delay=Math.max(30000*2**(attempts-1),error instanceof WhatsAppSendRejected?error.retryAfterMs || 0:0);
      const retryAt=new Date(Date.now()+delay);
      // A new version creates a distinct durable queue job. A crash between
      // commit and publication is recovered by the existing schedule outbox.
      const queued=await store.$transaction(async tx=>{
        const changed=await tx.reminder.updateMany({where:{id:reminderId,status:"sending",scheduleVersion:expectedVersion,state:"active"},data:{status:"delivery_retry",deliveryRetryAt:retryAt,scheduleVersion:{increment:1},deliveryStartedAt:null,deliveryErrorCodes:error instanceof WhatsAppSendRejected && error.code!==undefined?[error.code]:[]}});
        if(!changed.count)return false;
        const scheduled=await tx.scheduleOutbox.updateMany({where:{reminderId,phoneNumberId},data:{status:"pending",attempts:0,nextAttemptAt:retryAt,leaseToken:null,leaseUntil:null,lastError:error instanceof WhatsAppSendRejected?"send_rejected_retryable":"template_verification_retryable"}});
        if(!scheduled.count)throw Error("Outbox incompatível ao preparar retentativa.");
        return true;
      });
      return queued?"retry_scheduled":"skipped";
    }
    await store.reminder.updateMany({
      where: { id: reminderId, status: "sending",scheduleVersion:expectedVersion },
      data: { status: error instanceof WhatsAppPreflightError
        ? error.reason === "sender_not_configured"?"blocked_configuration":error.reason === "reminders_paused" ? "blocked_paused" : "blocked_template"
        : templateRejection(error) ? "blocked_template" : retryableRejection(error) ? "retry_exhausted" : error instanceof WhatsAppSendRejected ? "provider_rejected" : "delivery_unknown",
        ...(error instanceof WhatsAppSendRejected ? {deliveryStatus:"failed",deliveryErrorCodes:error.code === undefined ? [] : [error.code],deliveryUpdatedAt:new Date()} : {}),
      },
    });
    throw new Error("Não foi possível confirmar o resultado do envio do lembrete.");
  }
}
