import type { PrismaClient } from "@prisma/client";
import { dayOverview } from "./day.overview";
import { validTimezone } from "./preferences";

const cursors=new Map<string,string>();
const windowMinutes=5, minimumIntervalMs=20*60*60_000;

function dueDate(time:string|null,timezone:string,now:Date):string|null {
  if(!time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !validTimezone(timezone))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
  const [hour,minute]=time.split(":").map(Number);
  const elapsed=(+parts.hour*60 + +parts.minute)-(hour*60+minute);
  // Negative elapsed is deliberately not wrapped around midnight. Missed
  // summaries do not catch up on the next day or after an outage.
  return elapsed>=0 && elapsed<windowMinutes ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

function summaryText(overview:string) {
  const text="Resumo diário\n"+overview;
  if(text.length<=500)return text;
  const suffix="…\nEnvie MEU DIA para ver mais.";
  // slice by UTF-16 without leaving half of a surrogate pair.
  let head=text.slice(0,500-suffix.length);
  if(/[\uD800-\uDBFF]$/.test(head))head=head.slice(0,-1);
  return head+suffix;
}

export async function relayDailySummaries(store:PrismaClient,phoneNumberId:string,now=new Date(),shouldStop=()=>false) {
  if(shouldStop() || !phoneNumberId || !Number.isFinite(now.getTime()))return 0;
  const cursor=cursors.get(phoneNumberId);
  const preferences=await store.contactPreference.findMany({where:{phoneNumberId,summaryEnabled:true,remindersPaused:false,...(cursor?{phone:{gt:cursor}}:{})},orderBy:{phone:"asc"},take:50});
  if(preferences.length===50)cursors.set(phoneNumberId,preferences[49].phone);else cursors.delete(phoneNumberId);
  let created=0,failed=0;
  for(const preference of preferences){
    if(shouldStop())break;
    if(!dueDate(preference.summaryTime,preference.timezone,now))continue;
    try{
      const inserted=await store.$transaction(async tx=>{
        const user=await tx.user.upsert({where:{phone:preference.phone},create:{phone:preference.phone},update:{updatedAt:new Date()}});
        // Lock this preference too, so opt-out/pause cannot win the race before
        // the digest insert while the transaction keeps using stale settings.
        const locked=await tx.contactPreference.updateMany({where:{phoneNumberId,phone:preference.phone,summaryEnabled:true,remindersPaused:false},data:{updatedAt:new Date()}});
        if(!locked.count)return false;
        const current=await tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone:preference.phone}}});
        if(!current?.summaryEnabled || current.remindersPaused)return false;
        const date=dueDate(current.summaryTime,current.timezone,now);
        if(!date)return false;
        const digestKey=`${phoneNumberId}:${current.phone}:${date}`;
        if(await tx.reminder.findUnique({where:{digestKey},select:{id:true}}))return false;
        const recent=await tx.reminder.findFirst({where:{userId:user.id,kind:"daily_summary",scheduleOutbox:{phoneNumberId},createdAt:{gte:new Date(now.getTime()-minimumIntervalMs)}},select:{id:true}});
        if(recent)return false;
        const overview=await dayOverview(current.phone,phoneNumberId,tx,now);
        await tx.reminder.create({data:{userId:user.id,kind:"daily_summary",digestKey,title:summaryText(overview),scheduleTimezone:current.timezone,remindAt:now,createdAt:now,status:"scheduling_pending",scheduleOutbox:{create:{phoneNumberId}}}});
        return true;
      });
      if(inserted)created++;
    }catch{failed++;}
  }
  if(failed)console.error("Falha ao preparar resumo diário; nenhuma tentativa de envio real foi feita por este agendador.");
  return created;
}
