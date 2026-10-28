import {WhatsAppPreflightError} from "../domain/whatsapp.policy";
import {WhatsAppSendNotAttempted} from "../domain/whatsapp.errors";

export type TemplateEnv=Record<string,string|undefined>;
// This beta supports one positional text parameter in a UTILITY BODY; do not
// guess layouts for named parameters, dynamic headers or interactive templates.
export function verifiedTemplate(data:unknown,name:string,language:string){
 const rows=(data as any)?.data;
 if(!Array.isArray(rows))throw new WhatsAppPreflightError("template_required");
 const matches=rows.filter((r:any)=>r?.name===name && r?.language===language);
 const row=matches.length===1?matches[0]:null;
 if(!row || row.status!=="APPROVED" || row.category!=="UTILITY" || row.parameter_format && row.parameter_format!=="POSITIONAL")throw new WhatsAppPreflightError("template_required");
 const components=row.components;
 if(!Array.isArray(components) || components.some((c:any)=>!["BODY","FOOTER"].includes(c?.type)))throw new WhatsAppPreflightError("template_required");
 const bodies=components.filter((c:any)=>c.type==="BODY"),body=bodies[0];
 const parameters=typeof body?.text==="string"?[...body.text.matchAll(/\{\{([^}]+)\}\}/g)].map((m:any)=>m[1]):[];
 if(bodies.length!==1 || !parameters.length || parameters.some((p:string)=>p!=="1"))throw new WhatsAppPreflightError("template_required");
 return {name,language,status:"APPROVED" as const,parameterCount:1};
}
export async function verifyReminderTemplate(env:TemplateEnv,fetcher:typeof fetch=fetch){
 const name=env.WHATSAPP_REMINDER_TEMPLATE_NAME,language=env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE || "pt_BR",waba=env.WHATSAPP_BUSINESS_ACCOUNT_ID;
 if(env.WHATSAPP_REMINDER_TEMPLATE_APPROVED!=="true" || !name || !/^[a-z0-9_]+$/.test(name) || !waba || !/^\d+$/.test(waba) || !env.WHATSAPP_ACCESS_TOKEN)throw new WhatsAppPreflightError("template_required");
 const base=env.WHATSAPP_API_URL || "https://graph.facebook.com/v23.0";
 let endpoint:URL;try{endpoint=new URL(base);}catch{throw new WhatsAppPreflightError("template_required");}
 if(endpoint.protocol!=="https:" || endpoint.hostname!=="graph.facebook.com" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)throw new WhatsAppPreflightError("template_required");
 let response:Response;
 try{response=await fetcher(`${base}/${waba}/message_templates?${new URLSearchParams({name,fields:"name,status,language,category,parameter_format,components",limit:"100"})}`,{headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`},signal:AbortSignal.timeout(8000),redirect:"error"});}
 catch{throw new WhatsAppSendNotAttempted();}
 if(response.status===429 || response.status>=500)throw new WhatsAppSendNotAttempted();
 if(!response.ok)throw new WhatsAppPreflightError("template_required");
 let data:unknown;try{data=await response.json();}catch{throw new WhatsAppSendNotAttempted();}
 return verifiedTemplate(data,name,language);
}
