import type { PrismaClient } from "@prisma/client";

export function maximumLateness(value = process.env.REMINDER_MAX_LATENESS_MINUTES) {
  const minutes = value === undefined || value === "" ? 60 : Number(value);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error("REMINDER_MAX_LATENESS_MINUTES deve ser de 1 a 1440.");
  return minutes * 60000;
}

type Decision = {kind:"ready" | "skipped" | "missed"} | {kind:"defer"; until:number};
export async function prepareReminderExecution(store:Pick<PrismaClient,"reminder" | "$transaction">,
  reminderId:string, phoneNumberId:string, version:number, now=Date.now(), maxLateMs=maximumLateness()):Promise<Decision> {
  const row = await store.reminder.findUnique({where:{id:reminderId},include:{scheduleOutbox:true}});
  if (!row || row.scheduleOutbox?.phoneNumberId !== phoneNumberId || row.scheduleVersion !== version || row.state !== "active" ||
      !["pending","scheduled","scheduling_pending","scheduling_failed"].includes(row.status)) return {kind:"skipped"};
  const time = row.remindAt.getTime();
  if (time > now) return {kind:"defer",until:time};
  if (now-time <= maxLateMs) return {kind:"ready"};
  const changed = await store.$transaction(async tx=>{
    const expired = await tx.reminder.updateMany({where:{id:row.id,scheduleVersion:version,state:"active",
      status:{in:["pending","scheduled","scheduling_pending","scheduling_failed"]}},data:{status:"missed"}});
    if (expired.count) await tx.scheduleOutbox.updateMany({where:{reminderId:row.id,phoneNumberId},data:{status:"expired",leaseToken:null,leaseUntil:null}});
    return expired.count;
  });
  return {kind:changed ? "missed" : "skipped"};
}
