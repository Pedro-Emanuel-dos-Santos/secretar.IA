import type { PrismaClient,Reminder,Appointment } from "@prisma/client";
import { reminderScope } from "./reminder.management";
import { parseInterpretation } from "./interpretation.validation";

type Store=Pick<PrismaClient,"reminder"|"appointment">;
type FocusHistory={receivedAt:Date;interpretation:unknown;reply:{status:string;finishedAt:Date|null}|null;reminder:{id:string}|null;appointment:{id:string}|null};
type FocusReminder=Pick<Reminder,"id"|"title"|"remindAt"|"state"|"status"|"scheduleVersion"|"subjectId"|"taskProgress"|"waitingFor">;
type FocusAppointment=Pick<Appointment,"id"|"title"|"startsAt"|"endsAt"|"state"|"version"|"subjectId"> & {reminders:{id:string;remindAt:Date;appointmentOffsetMinutes:number|null}[]};
type Focus={focusedReminder:FocusReminder|null;focusedAppointment:FocusAppointment|null};
// A focus describes the last item actually discussed, not the first item in an
// upcoming-items preview. Draft recovery has its own, longer lifetime.
export async function recentConversationFocus(store:Store,phone:string,phoneNumberId:string,now:Date,history:FocusHistory[]):Promise<Focus>{
 const empty:Focus={focusedReminder:null,focusedAppointment:null};
 const since=new Date(now.getTime()-30*60000);
 for(const row of history){
  if(row.receivedAt<since)break;
  let intent;try{intent=parseInterpretation(JSON.stringify(row.interpretation));}catch{intent=null;}
  if(intent?.action==="conversation")continue;
  if(row.reply?.status!=="provider_accepted" || !row.reply.finishedAt || row.reply.finishedAt>now)return empty;
  const appointmentId=row.appointment?.id || intent?.appointmentId;
  if(appointmentId){
   const record=await store.appointment.findFirst({where:{id:appointmentId,user:{phone},phoneNumberId,state:"active"},select:{id:true,title:true,startsAt:true,endsAt:true,state:true,version:true,subjectId:true,reminders:{where:{state:"active"},select:{id:true,remindAt:true,appointmentOffsetMinutes:true}}}});
   return record?{...empty,focusedAppointment:record}:empty;
  }
  const reminderId=row.reminder?.id || intent?.reminderId;
  if(reminderId){
   const record=await store.reminder.findFirst({where:{...reminderScope(phone,phoneNumberId),id:reminderId,state:"active",appointmentId:null},select:{id:true,title:true,remindAt:true,state:true,status:true,scheduleVersion:true,subjectId:true,taskProgress:true,waitingFor:true}});
   return record?{...empty,focusedReminder:record}:empty;
  }
  // Lists, new drafts, notes and unrelated operations end implicit targeting.
  return empty;
 }
 return empty;
}
