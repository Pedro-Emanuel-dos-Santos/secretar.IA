import type { Prisma } from "@prisma/client";
import type { AIInterpretation } from "../types/ai.types";
export const defaultTimezone="America/Sao_Paulo";
const audioDisclosureVersion=1;
export function validTimezone(zone:string){
  if(zone.length>100 || (!zone.includes("/") && zone!=="UTC"))return false;
  try{new Intl.DateTimeFormat("pt-BR",{timeZone:zone}).format(new Date());return true;}catch{return false;}
}
export async function contactTimezone(tx:Pick<Prisma.TransactionClient,"contactPreference">,phone:string,phoneNumberId:string){
  const preference=await tx.contactPreference.findUnique({where:{phoneNumberId_phone:{phoneNumberId,phone}}});
  return preference?.timezone && validTimezone(preference.timezone)?preference.timezone:defaultTimezone;
}
export function audioDisclosure(){
 const provider=process.env.AUDIO_TRANSCRIPTION_PROVIDER || "local";
 return "Para entender seus áudios, preciso baixar a mídia da Meta e transcrevê-la "+(provider==="openai"?"usando a OpenAI.":"no servidor da Secretár.IA.")+" O texto transcrito é guardado e pode seguir para a IA configurada. O arquivo de voz não é salvo pela aplicação. Se concordar, envie ACEITO AUDIO. Para retirar a autorização, envie DESATIVAR AUDIO. A disponibilidade também depende da configuração do servidor.";
}
export async function presentAudioDisclosure(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,sourceId?:string){
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 await tx.event.create({data:{userId:user.id,type:"audio_disclosure",source:"secretaria",payload:{phoneNumberId,provider:process.env.AUDIO_TRANSCRIPTION_PROVIDER || "local",version:audioDisclosureVersion,sourceMessageId:sourceId || null}}});
 return audioDisclosure();
}
export async function setAudioConsent(phone:string,phoneNumberId:string,enabled:boolean,tx:Prisma.TransactionClient,sourceId?:string){
 const provider=process.env.AUDIO_TRANSCRIPTION_PROVIDER || "local";
 if(enabled){
  const disclosed=await tx.event.findFirst({where:{user:{phone},type:"audio_disclosure",createdAt:{gte:new Date(Date.now()-86400000)},AND:[{payload:{path:["phoneNumberId"],equals:phoneNumberId}},{payload:{path:["provider"],equals:provider}},{payload:{path:["version"],equals:audioDisclosureVersion}}]},orderBy:[{createdAt:"desc"},{id:"desc"}]});
  const payload=disclosed?.payload as Record<string,unknown>|undefined;
  const delivered=typeof payload?.sourceMessageId==="string" && await tx.incomingMessage.findFirst({where:{id:payload.sourceMessageId,phone,phoneNumberId,reply:{status:"provider_accepted"}},select:{id:true}});
  if(!delivered)return presentAudioDisclosure(phone,phoneNumberId,tx,sourceId);
 }
 await tx.contactPreference.upsert({where:{phoneNumberId_phone:{phoneNumberId,phone}},create:{phoneNumberId,phone,audioConsent:enabled,audioConsentProvider:enabled?provider:null,audioConsentAt:enabled?new Date():null},update:{audioConsent:enabled,audioConsentProvider:enabled?provider:null,audioConsentAt:enabled?new Date():null}});
 return enabled?"Registrei sua autorização para transcrever áudios com o provedor informado. Se o servidor ainda não estiver habilitado, os pedidos continuam por texto.":"Retirei sua autorização de áudio. Pedidos por texto continuam disponíveis; uma transcrição já iniciada pode terminar.";
}
export async function executePreferences(phone:string,phoneNumberId:string,intent:AIInterpretation,tx:Prisma.TransactionClient,sourceId?:string){
 const where={phoneNumberId_phone:{phoneNumberId,phone}};
 if(intent.action==="usage_summary"){
   const rows=await tx.aiUsage.findMany({where:{message:{phone,phoneNumberId},createdAt:{gte:new Date(Date.now()-86400000)}},select:{inputTokens:true,outputTokens:true,outcome:true}});
   const known=rows.filter(r=>r.inputTokens!==null && r.outputTokens!==null);
   return `Nas últimas 24 horas: ${rows.length} tentativa(s) de interpretação com IA registradas. Tokens informados pelo provedor: ${known.reduce((n,r)=>n+r.inputTokens!,0)} de entrada e ${known.reduce((n,r)=>n+r.outputTokens!,0)} de saída. ${rows.length-known.length} tentativa(s) sem medição completa. Isso não é valor em reais nem inclui áudio ou taxas do WhatsApp.`;
 }
 if(intent.action==="show_preferences"){
   const p=await tx.contactPreference.findUnique({where});
   return `Seu perfil: ${p?.displayName || "nome não informado"}. Atividade: ${p?.businessType || "não informada"}. Fuso: ${p?.timezone || defaultTimezone}. Avisos: ${p?.remindersPaused?"pausados":"ativos"}. Áudio: ${p?.audioConsent?"autorizado para "+p.audioConsentProvider:"não autorizado"}. Resumo diário: ${p?.summaryEnabled?"às "+p.summaryTime:"desativado"}.`;
 }
 if(intent.audioConsent===true)return presentAudioDisclosure(phone,phoneNumberId,tx,sourceId);
 if(intent.audioConsent===false)return setAudioConsent(phone,phoneNumberId,false,tx,sourceId);
 if(!intent.timezone && !intent.displayName && !intent.businessType && intent.summaryEnabled===undefined)return "Pode me dizer seu nome, atividade ou fuso? Exemplo de fuso: America/Manaus. Não preciso de documento nem dados de pagamento.";
 if(intent.timezone && !validTimezone(intent.timezone))return "Qual é o fuso IANA? Por exemplo: America/Sao_Paulo, America/Manaus ou America/Rio_Branco. Não alterei seu perfil.";
 if(intent.summaryEnabled===true && !intent.summaryTime)return "Que horas você quer receber o resumo diário no seu fuso?";
 const data={...(intent.timezone?{timezone:intent.timezone}:{}),...(intent.displayName?{displayName:intent.displayName}:{}),...(intent.businessType?{businessType:intent.businessType}:{}),...(intent.summaryEnabled!==undefined?{summaryEnabled:intent.summaryEnabled,summaryTime:intent.summaryEnabled?intent.summaryTime:null}:{}),onboardedAt:new Date()};
 await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}});
 await tx.contactPreference.upsert({where,create:{phoneNumberId,phone,...data},update:data});
 if(intent.summaryEnabled===false){
   await tx.reminder.updateMany({where:{user:{phone},kind:"daily_summary",state:"active",scheduleOutbox:{phoneNumberId},status:{in:["pending","scheduled","scheduling_pending","scheduling_failed","blocked_template","blocked_paused","missed","provider_rejected","delivery_retry","retry_exhausted","blocked_configuration"]}},data:{state:"cancelled",taskProgress:"cancelled",scheduleVersion:{increment:1}}});
   await tx.scheduleOutbox.updateMany({where:{phoneNumberId,reminder:{user:{phone},kind:"daily_summary",state:"cancelled"}},data:{status:"cancelled",leaseToken:null,leaseUntil:null}});
 }
 return "Atualizei seu perfil. "+(intent.timezone?`Vou interpretar novos pedidos no fuso ${intent.timezone}. Avisos já salvos mantêm seus instantes; não reagendei nenhum. `:"")+(intent.summaryEnabled===true?`Resumo diário ativado às ${intent.summaryTime} no seu fuso. O envio depende das regras da janela do WhatsApp.`:intent.summaryEnabled===false?"Resumo diário desativado. Um envio já iniciado ainda pode chegar.":"");
}
