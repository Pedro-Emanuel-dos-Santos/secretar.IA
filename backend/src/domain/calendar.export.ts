import {createHash} from "node:crypto";
import type {PrismaClient} from "@prisma/client";
type CalendarEvent={id:string;title:string;description:string|null;startsAt:Date;endsAt:Date|null;updatedAt:Date;version:number};
const stamp=(date:Date)=>{if(!Number.isFinite(date.getTime()))throw Error("Data inválida.");return date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");};
const escapeText=(text:string)=>text.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"");
function fold(line:string){let current="",result:string[]=[];for(const char of line){if(Buffer.byteLength(current+char,"utf8")>75){result.push(current);current=" ";}current+=char;}result.push(current);return result.join("\r\n");}
export function calendarIcs(events:CalendarEvent[],phoneNumberId:string){
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Secretar.IA//Personal Calendar//PT-BR","CALSCALE:GREGORIAN"];
 for(const event of events){
  if(event.endsAt && event.endsAt<=event.startsAt)throw Error("Intervalo inválido.");
  const uid=createHash("sha256").update(phoneNumberId+"/"+event.id).digest("hex");
  lines.push("BEGIN:VEVENT",`UID:${uid}@secretaria.invalid`,`DTSTAMP:${stamp(event.updatedAt)}`,`DTSTART:${stamp(event.startsAt)}`);
  if(event.endsAt)lines.push(`DTEND:${stamp(event.endsAt)}`);
  lines.push(`SEQUENCE:${event.version}`,"CLASS:PRIVATE",`SUMMARY:${escapeText(event.title)}`);
  if(event.description)lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  lines.push("END:VEVENT");
 }
 lines.push("END:VCALENDAR");return lines.map(fold).join("\r\n")+"\r\n";
}
export async function exportCalendar(store:Pick<PrismaClient,"appointment">,phone:string,phoneNumberId:string,start:Date,end:Date){
 if(!/^\d{10,15}$/.test(phone) || !phoneNumberId || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start || end.getTime()-start.getTime()>93*86400000)throw Error("Consulta inválida.");
 const events=await store.appointment.findMany({where:{user:{phone},phoneNumberId,state:"active",startsAt:{gte:start,lt:end}},select:{id:true,title:true,description:true,startsAt:true,endsAt:true,updatedAt:true,version:true},orderBy:[{startsAt:"asc"},{id:"asc"}],take:1001});
 if(events.length>1000)throw Error("Reduza o período.");
 return calendarIcs(events,phoneNumberId);
}
