import "dotenv/config";
import { resolveWhatsAppRecipient } from "../domain/whatsapp.recipient";
import type {PrismaClient} from "@prisma/client";
import { whatsappPayload, WhatsAppPreflightError } from "../domain/whatsapp.policy";
import type { ReminderControls } from "../domain/reminder.buttons";
import { providerRejection,WhatsAppSendRejected } from "../domain/whatsapp.errors";
import {verifyReminderTemplate} from "./whatsapp-template.service";

type Store=Pick<PrismaClient,"incomingMessage"|"contactPreference">;
export function createWhatsAppSender(store:Store,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch,now=()=>Date.now()){
 return async function send(phone:string,message:string,kind:"reply"|"reminder"="reply",controls?:ReminderControls){
  const phoneNumberId=env.WHATSAPP_PHONE_NUMBER_ID,token=env.WHATSAPP_ACCESS_TOKEN;
  if(!phoneNumberId || !token)throw new WhatsAppPreflightError("sender_not_configured");
  const apiUrl=env.WHATSAPP_API_URL || "https://graph.facebook.com/v23.0";
  let endpoint:URL;try{endpoint=new URL(apiUrl);}catch{throw new WhatsAppPreflightError("sender_not_configured");}
  if(endpoint.protocol!=="https:" || endpoint.hostname!=="graph.facebook.com" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)throw new WhatsAppPreflightError("sender_not_configured");
  if(kind==="reminder"){
   const preference=await store.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone}}});
   if(preference?.remindersPaused)throw new WhatsAppPreflightError("reminders_paused");
  }
  const latest=await store.incomingMessage.findFirst({where:{phone,phoneNumberId,status:{notIn:["erased","plan_step"]}},orderBy:{receivedAt:"desc"},select:{receivedAt:true}});
  const template={name:env.WHATSAPP_REMINDER_TEMPLATE_NAME,language:env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE || "pt_BR",approved:env.WHATSAPP_REMINDER_TEMPLATE_APPROVED==="true"};
  const recipient=resolveWhatsAppRecipient(phone,env.WHATSAPP_RECIPIENT_MAP);
  async function post(lastInbound:Date|null,allowWindowFallback:boolean):Promise<unknown>{
   const body=whatsappPayload(recipient,message,lastInbound,kind,template,now(),controls);
   if(body.type==="template")await verifyReminderTemplate(env,fetcher);
   const response=await fetcher(`${apiUrl}/${phoneNumberId}/messages`,{method:"POST",signal:AbortSignal.timeout(15000),redirect:"error",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json();
   if(!response.ok){
    const rejected=providerRejection(response.status,data);
    if(rejected){
     // The provider explicitly refused free-form delivery; only then try the verified template once.
     if(allowWindowFallback && kind==="reminder" && body.type!=="template" && rejected.code===131047)return post(null,false);
     const seconds=Number(response.headers.get("retry-after"));
     if(seconds>0 && Number.isFinite(seconds))throw new WhatsAppSendRejected(rejected.httpStatus,rejected.code,Math.min(900000,Math.ceil(seconds*1000)));
     throw rejected;
    }
    throw Error("Resultado de envio não confirmado.");
   }
   return data;
  }
  return post(latest?.receivedAt ?? null,true);
 };
}

