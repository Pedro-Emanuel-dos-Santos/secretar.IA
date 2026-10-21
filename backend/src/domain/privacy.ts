import {createHash,randomBytes} from "node:crypto";
import {Prisma} from "@prisma/client";
import {reminderScope} from "./reminder.management";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function requestContentDeletion(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient){
 const user=await tx.user.upsert({where:{phone},create:{phone},update:{updatedAt:new Date()}}),token=randomBytes(4).toString("hex").toUpperCase();
 await tx.event.deleteMany({where:{userId:user.id,type:"privacy_deletion_pending",payload:{path:["phoneNumberId"],equals:phoneNumberId}}});
 await tx.event.create({data:{userId:user.id,type:"privacy_deletion_pending",source:"secretaria",payload:{phoneNumberId,tokenHash:hash(token),expiresAt:new Date(Date.now()+15*60000).toISOString()}}});
 return `Isso apagará tarefas, compromissos, notas, cadastros e textos de mensagens deste contato nesta conta da Secretár.IA, e pausará os avisos. Outros números comerciais não serão afetados. Conservamos telefone de bloqueio e identificadores técnicos mínimos para impedir reenvios; não apaga dados já mantidos pela Meta ou provedor de IA. Para confirmar em até 15 minutos, envie CONFIRMAR EXCLUSAO ${token}. Se não quiser, não confirme.`;
}
export async function confirmContentDeletion(phone:string,phoneNumberId:string,tx:Prisma.TransactionClient,current:{id:string;text:string}){
 const match=current.text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().match(/^CONFIRMAR EXCLUSAO ([A-F0-9]{8})$/i);
 if(!match)return "A confirmação não é válida. Envie APAGAR MEUS DADOS para receber uma nova solicitação.";
 const user=await tx.user.findUnique({where:{phone}});
 if(!user)return "Não há uma solicitação válida de limpeza para este contato.";
 const pending=await tx.event.findFirst({where:{userId:user.id,type:"privacy_deletion_pending",payload:{path:["phoneNumberId"],equals:phoneNumberId}},orderBy:{createdAt:"desc"}});
 const payload=pending?.payload as Record<string,unknown>|undefined;
 if(!pending || payload?.tokenHash!==hash(match[1].toUpperCase()) || typeof payload.expiresAt!=="string" || new Date(payload.expiresAt).getTime()<=Date.now())return "A confirmação expirou ou não corresponde à solicitação atual. Envie APAGAR MEUS DADOS para começar novamente.";
 await tx.user.update({where:{id:user.id},data:{updatedAt:new Date()}});
 await tx.$queryRaw`SELECT r.id FROM "Reminder" r WHERE r."userId"=${user.id} AND (EXISTS(SELECT 1 FROM "ScheduleOutbox" s WHERE s."reminderId"=r.id AND s."phoneNumberId"=${phoneNumberId}) OR EXISTS(SELECT 1 FROM "IncomingMessage" m WHERE m.id=r."sourceMessageId" AND m."phoneNumberId"=${phoneNumberId})) ORDER BY r.id FOR UPDATE`;
 await tx.$queryRaw`SELECT r.id FROM "ReplyOutbox" r JOIN "IncomingMessage" m ON m.id=r."messageId" WHERE m.phone=${phone} AND m."phoneNumberId"=${phoneNumberId} ORDER BY r.id FOR UPDATE OF r`;
 const ownMessage={phone,phoneNumberId},scope=reminderScope(phone,phoneNumberId,true);
 const [uncertainReminder,uncertainReply]=await Promise.all([
  tx.reminder.count({where:{...scope,status:{in:["sending","delivery_unknown"]}}}),
  tx.replyOutbox.count({where:{message:ownMessage,status:{in:["sending","delivery_unknown"]}}}),
 ]);
 if(uncertainReminder || uncertainReply)return "Há um envio em andamento ou sem resultado confirmado. Não apaguei os registros necessários para verificar esse envio. Aguarde a resolução antes de confirmar novamente.";
 // Revoke leases before erasing sources: late interpretations cannot commit
 // fresh actions or replies after this transaction. Current confirmation keeps
 // only the lease required to return the outcome to the same contact.
 await tx.incomingMessage.updateMany({where:{...ownMessage,id:{not:current.id}},data:{text:"[conteúdo removido]",interpretation:Prisma.DbNull,mediaId:null,mediaMimeType:null,transcribedAt:null,status:"erased",leaseToken:null,leaseUntil:null,lastError:null}});
 await tx.replyOutbox.updateMany({where:{message:ownMessage},data:{text:"[conteúdo removido]",status:"cancelled"}});
 await tx.aiUsage.deleteMany({where:{message:ownMessage}});
 await tx.reminder.deleteMany({where:scope});
 await tx.appointment.deleteMany({where:{userId:user.id,phoneNumberId}});
 await tx.businessSubject.deleteMany({where:{userId:user.id,phoneNumberId}});
 await tx.event.deleteMany({where:{userId:user.id,payload:{path:["phoneNumberId"],equals:phoneNumberId}}});
 await tx.contactPreference.upsert({where:{phoneNumberId_phone:{phoneNumberId,phone}},create:{phoneNumberId,phone,remindersPaused:true},update:{remindersPaused:true,pausedAt:new Date(),timezone:"America/Sao_Paulo",displayName:null,businessType:null,onboardedAt:null,audioConsent:false,audioConsentAt:null,audioConsentProvider:null,summaryEnabled:false,summaryTime:null}});
 await tx.incomingMessage.updateMany({where:{id:current.id,...ownMessage},data:{text:"[solicitação de limpeza concluída]",interpretation:Prisma.DbNull,mediaId:null,mediaMimeType:null,transcribedAt:null}});
 const others=await tx.reminder.count({where:{userId:user.id}})+await tx.appointment.count({where:{userId:user.id}})+await tx.businessSubject.count({where:{userId:user.id}})+await tx.event.count({where:{userId:user.id}})+await tx.contactPreference.count({where:{phone,phoneNumberId:{not:phoneNumberId}}});
 if(!others)await tx.user.update({where:{id:user.id},data:{name:null,timezone:"America/Sao_Paulo"}});
 return "Limpei o conteúdo pessoal deste contato nesta conta da Secretár.IA e pausei seus avisos. Mantive apenas dados mínimos de bloqueio e controle de entrega; a confirmação atual ficará registrada. Dados na Meta e no provedor de IA não são apagados por esta operação.";
}

