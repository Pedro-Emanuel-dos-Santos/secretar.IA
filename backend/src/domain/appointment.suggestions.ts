import type {PrismaClient} from "@prisma/client";
import type {AIInterpretation} from "../types/ai.types";
import {parseInterpretation} from "./interpretation.validation";
type Store=Pick<PrismaClient,"event"|"incomingMessage">;
export type AppointmentSuggestions={id:string;items:{startsAt:string;endsAt:string}[];request:AIInterpretation};
export async function shownAppointmentSuggestions(store:Store,phone:string,phoneNumberId:string,now:Date):Promise<AppointmentSuggestions|null>{
 const event=await store.event.findFirst({where:{type:"appointment_suggestions",user:{phone},createdAt:{gte:new Date(now.getTime()-15*60000),lte:now},payload:{path:["phoneNumberId"],equals:phoneNumberId}},orderBy:[{createdAt:"desc"},{id:"desc"}]});
 if(!event)return null;const payload=event.payload as any;
 const latest=await store.incomingMessage.findFirst({where:{phone,phoneNumberId,reply:{status:"provider_accepted",finishedAt:{lte:now}}},orderBy:[{reply:{finishedAt:"desc"}},{id:"desc"}],select:{id:true}});
 if(typeof payload.sourceMessageId!=="string" || latest?.id!==payload.sourceMessageId || !Array.isArray(payload.items) || payload.items.length<1 || payload.items.length>3 || !["create_appointment","reschedule_appointment"].includes(payload.request?.action))return null;
 if(!payload.items.every((s:any)=>typeof s.startsAt==="string" && typeof s.endsAt==="string" && Number.isFinite(Date.parse(s.startsAt)) && Date.parse(s.endsAt)>Date.parse(s.startsAt)))return null;
 let request;try{request=parseInterpretation(JSON.stringify(payload.request));}catch{return null;}
 return {id:event.id,items:payload.items,request};
}
export function chooseAppointmentSuggestion(intent:AIInterpretation,text:string,suggestions:AppointmentSuggestions|null){
 delete intent.appointmentSuggestionId;delete intent.appointmentSuggestionIndex;
 if(!suggestions)return;
 const s=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
 const choice=s.match(/^(?:(?:pode ser|prefiro|quero|escolho|marca|marque|pode marcar|reagenda|pode reagendar)\s+)?(?:(?:o|a)\s+(primeir[oa]|segund[oa]|terceir[oa]|[123])(?:\s+opcao)?|opcao\s+([123])|(primeira|segunda|terceira)\s+opcao)[.!]*$/);
 if(!choice){
  if((/\b(?:opcao|opcoes)\b/.test(s) || /\b(?:a|o)\s+(?:primeir[oa]|segund[oa]|terceir[oa])\b/.test(s)) && ["create_appointment","reschedule_appointment","cancel_appointment","create_reminder","reschedule_reminder","cancel_reminder","complete_reminder"].includes(intent.action)){
   intent.action="conversation";intent.datetime=null;intent.reminderId=null;intent.appointmentId=null;intent.reply="Não alterei o agendamento. Qual opção você prefere?";
  }
  return;
 }
 const value=choice[1] || choice[2] || choice[3],index=/^[123]$/.test(value)?Number(value)-1:value.startsWith("primeir")?0:value.startsWith("segund")?1:2;
 if(!suggestions.items[index]){intent.action="conversation";intent.reply="Qual das opções apresentadas você prefere?";return;}
 // Copy the persisted original request, never a target or title guessed during
 // selection. The executor revalidates this snapshot and checks conflicts again.
 const request=suggestions.request;
 for(const key of Object.keys(intent))delete (intent as any)[key];
 Object.assign(intent,request,{datetime:suggestions.items[index].startsAt,draft:null,appointmentSuggestionId:suggestions.id,appointmentSuggestionIndex:index});
 delete intent.selectionListId;delete intent.selectionIndex;delete intent.selectionFocusId;
}
