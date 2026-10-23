import {calendarDay,dayBoundary} from "./day.overview";
import type {Prisma} from "@prisma/client";
type Busy={startsAt:Date;endsAt:Date|null};
export function availableSlots(busy:Busy[],start:Date,end:Date,durationMs:number){
 if(!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start || !Number.isSafeInteger(durationMs) || durationMs<60000 || durationMs>86400000)return [];
 const blocks=busy.map(b=>({start:b.startsAt.getTime(),end:(b.endsAt || end).getTime()}));
 if(blocks.some(b=>!Number.isFinite(b.start) || !Number.isFinite(b.end) || b.end<b.start))return [];
 blocks.sort((a,b)=>a.start-b.start || a.end-b.end);
 let cursor=Math.ceil(start.getTime()/60000)*60000;
 const result:{startsAt:Date;endsAt:Date}[]=[];
 const fill=(until:number)=>{while(cursor+durationMs<=until && result.length<3){result.push({startsAt:new Date(cursor),endsAt:new Date(cursor+durationMs)});cursor+=durationMs;}};
 for(const block of blocks){if(block.end<=cursor)continue;fill(Math.min(block.start,end.getTime()));cursor=Math.ceil(Math.max(cursor,block.end)/60000)*60000;if(cursor>=end.getTime() || result.length>=3)break;}
 if(result.length<3)fill(end.getTime());return result;
}
export async function appointmentAlternatives(tx:Prisma.TransactionClient,phone:string,phoneNumberId:string,requested:Date,durationMs:number,zone:string,excludeId?:string,leadMinutes=0){
 const localDay=calendarDay(requested.getTime(),zone),dayStart=dayBoundary(localDay,zone),dayEnd=dayBoundary(localDay+86400000,zone);
 const rows=await tx.appointment.findMany({where:{user:{phone},phoneNumberId,state:"active",...(excludeId?{id:{not:excludeId}}:{}),startsAt:{lt:dayEnd},OR:[{endsAt:{gt:dayStart}},{endsAt:null,startsAt:{gte:dayStart}}]},select:{startsAt:true,endsAt:true},orderBy:{startsAt:"asc"},take:1001});
 if(rows.length>1000)return [];
 return availableSlots(rows,new Date(Math.max(requested.getTime(),Date.now()+leadMinutes*60000+1000)),dayEnd,durationMs);
}
export function slotLabel(slot:{startsAt:Date;endsAt:Date},zone:string){
 const format=(d:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:zone,dateStyle:"short",timeStyle:"short"}).format(d);
 const offset=(d:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:zone,timeZoneName:"shortOffset"}).formatToParts(d).find(p=>p.type==="timeZoneName")?.value;
 const day=calendarDay(slot.startsAt.getTime(),zone);
 const changed=offset(slot.startsAt)!==offset(slot.endsAt) || offset(dayBoundary(day,zone))!==offset(dayBoundary(day+86400000,zone));
 return `${format(slot.startsAt)}${changed?" "+offset(slot.startsAt):""} até ${format(slot.endsAt)}${changed?" "+offset(slot.endsAt):""}`;
}
